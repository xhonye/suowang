import { randomUUID } from 'node:crypto';
import { APP_VERSION } from './app-meta.mjs';

const STATE_IDS = new Set(['restore', 'work', 'life']);
const END_STATUSES = new Set(['completed', 'abandoned']);
const TODO_KINDS = new Set(['single', 'ongoing']);
const WORKSPACE_DENSITIES = new Set(['small', 'medium', 'large', 'max']);

export class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function requiredText(value, label, maxLength = 120) {
  const text = String(value ?? '').trim();
  if (!text) throw new AppError(400, 'validation_error', `${label}不能为空。`);
  if (text.length > maxLength) {
    throw new AppError(400, 'validation_error', `${label}不能超过 ${maxLength} 个字符。`);
  }
  return text;
}

function optionalText(value, label, maxLength = 240) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) {
    throw new AppError(400, 'validation_error', `${label}不能超过 ${maxLength} 个字符。`);
  }
  return text;
}

export function normalizeMainlineName(value) {
  return requiredText(value, '主线名称', 60)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function mapMainline(row) {
  return {
    id: row.id,
    stateId: row.state_id,
    slotIndex: row.slot_index,
    name: row.name,
    goal: row.goal,
    successCriteria: row.success_criteria,
    horizon: row.horizon,
    status: row.status,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

function mapTodo(row) {
  return {
    id: row.id,
    stateId: row.state_id,
    mainlineId: row.mainline_id,
    title: row.title,
    minimalStep: row.minimal_step,
    kind: row.kind,
    completionCount: Number(row.completion_count ?? 0),
    completedToday: Boolean(row.completed_today),
    status: row.status,
    position: row.position,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

function translateDatabaseError(error) {
  if (error instanceof AppError) return error;
  const message = String(error?.message ?? error);
  if (message.includes('mainlines.normalized_name')) {
    return new AppError(409, 'duplicate_mainline_name', '主线名称需要在全部行迹中保持唯一。');
  }
  if (message.includes('active_mainline_slot')) {
    return new AppError(409, 'slot_occupied', '这个主线槽已经被占用。');
  }
  if (message.includes('todo_mainline_state_mismatch')) {
    return new AppError(409, 'state_mismatch', '事项不能移动到其他模式的主线。');
  }
  return error;
}

export class SuowangService {
  constructor(runtime, { clock = () => new Date() } = {}) {
    this.runtime = runtime;
    this.clock = clock;
  }

  get db() {
    return this.runtime.db;
  }

  now() {
    return this.clock().toISOString();
  }

  localDate() {
    const date = this.clock();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  mutate(action) {
    try {
      return this.db.transaction(action)();
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }

  assertState(stateId) {
    if (!STATE_IDS.has(stateId)) {
      throw new AppError(404, 'state_not_found', '未找到这个模式。');
    }
    return this.db.prepare('SELECT * FROM states WHERE id = ?').get(stateId);
  }

  requireMainline(id, { active = false } = {}) {
    const row = this.db.prepare('SELECT * FROM mainlines WHERE id = ?').get(id);
    if (!row) throw new AppError(404, 'mainline_not_found', '未找到这条主线。');
    if (active && row.status !== 'active') {
      throw new AppError(409, 'mainline_is_history', '行迹中的主线不能再修改。');
    }
    return row;
  }

  requireTodo(id, { active = false } = {}) {
    const row = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!row) throw new AppError(404, 'todo_not_found', '未找到这条事项。');
    if (active && row.status !== 'active') {
      throw new AppError(409, 'todo_is_history', '行迹中的事项不能再修改。');
    }
    return row;
  }

  nextPosition(stateId, mainlineId) {
    const row = mainlineId === null
      ? this.db.prepare(`
          SELECT COALESCE(MAX(position), 0) + 1 AS position
          FROM todos WHERE state_id = ? AND mainline_id IS NULL AND status = 'active'
        `).get(stateId)
      : this.db.prepare(`
          SELECT COALESCE(MAX(position), 0) + 1 AS position
          FROM todos WHERE state_id = ? AND mainline_id = ? AND status = 'active'
        `).get(stateId, mainlineId);
    return row.position;
  }

  renumberScope(stateId, mainlineId) {
    const rows = mainlineId === null
      ? this.db.prepare(`
          SELECT id FROM todos
          WHERE state_id = ? AND mainline_id IS NULL AND status = 'active'
          ORDER BY position, created_at, id
        `).all(stateId)
      : this.db.prepare(`
          SELECT id FROM todos
          WHERE state_id = ? AND mainline_id = ? AND status = 'active'
          ORDER BY position, created_at, id
        `).all(stateId, mainlineId);
    const update = this.db.prepare('UPDATE todos SET position = ? WHERE id = ?');
    rows.forEach((row, index) => update.run(index + 1, row.id));
  }

  firstActiveMainline(stateId, excludedId = null) {
    return this.db.prepare(`
      SELECT id FROM mainlines
      WHERE state_id = ? AND status = 'active' AND id != COALESCE(?, '')
      ORDER BY slot_index
      LIMIT 1
    `).get(stateId, excludedId)?.id ?? null;
  }

  firstEligibleTodo(stateId, currentMainlineId) {
    const completedOn = this.localDate();
    if (currentMainlineId) {
      const currentTodo = this.db.prepare(`
        SELECT id FROM todos AS todo
        WHERE state_id = ? AND mainline_id = ? AND status = 'active'
          AND NOT (kind = 'ongoing' AND EXISTS (
            SELECT 1 FROM todo_occurrences
            WHERE todo_id = todo.id AND completed_on = ?
          ))
        ORDER BY position, created_at, id
        LIMIT 1
      `).get(stateId, currentMainlineId, completedOn);
      if (currentTodo) return currentTodo.id;
    }
    return this.db.prepare(`
      SELECT id FROM todos AS todo
      WHERE state_id = ? AND mainline_id IS NULL AND status = 'active'
        AND NOT (kind = 'ongoing' AND EXISTS (
          SELECT 1 FROM todo_occurrences
          WHERE todo_id = todo.id AND completed_on = ?
        ))
      ORDER BY position, created_at, id
      LIMIT 1
    `).get(stateId, completedOn)?.id ?? null;
  }

  reconcilePointers(stateId, currentMainlineId, preferredPriorityId = null) {
    let currentId = currentMainlineId;
    if (currentId) {
      const validCurrent = this.db.prepare(`
        SELECT 1 FROM mainlines WHERE id = ? AND state_id = ? AND status = 'active'
      `).get(currentId, stateId);
      if (!validCurrent) currentId = null;
    }

    let priorityId = null;
    if (preferredPriorityId) {
      const preferred = this.db.prepare(`
        SELECT id FROM todos AS todo
        WHERE id = ? AND state_id = ? AND status = 'active'
          AND (mainline_id IS NULL OR mainline_id = ?)
          AND NOT (kind = 'ongoing' AND EXISTS (
            SELECT 1 FROM todo_occurrences
            WHERE todo_id = todo.id AND completed_on = ?
          ))
      `).get(preferredPriorityId, stateId, currentId, this.localDate());
      priorityId = preferred?.id ?? null;
    }
    if (!priorityId) priorityId = this.firstEligibleTodo(stateId, currentId);

    this.db.prepare(`
      UPDATE states
      SET current_mainline_id = ?,
          priority_todo_id = ?,
          started_todo_id = CASE WHEN started_todo_id = ? THEN started_todo_id ELSE NULL END
      WHERE id = ?
    `).run(currentId, priorityId, priorityId, stateId);
    return { currentId, priorityId };
  }

  snapshot() {
    const completedOn = this.localDate();
    const settings = this.db.prepare('SELECT * FROM app_settings WHERE singleton = 1').get();
    const stateRows = this.db.prepare('SELECT * FROM states ORDER BY sort_order').all();
    const mainlineRows = this.db.prepare(`
      SELECT * FROM mainlines WHERE status = 'active' ORDER BY state_id, slot_index
    `).all();
    const todoRows = this.db.prepare(`
      SELECT todo.*,
        COUNT(occurrence.id) AS completion_count,
        MAX(CASE WHEN occurrence.completed_on = ? THEN 1 ELSE 0 END) AS completed_today
      FROM todos AS todo
      LEFT JOIN todo_occurrences AS occurrence ON occurrence.todo_id = todo.id
      WHERE todo.status = 'active'
      GROUP BY todo.id
      ORDER BY state_id, mainline_id, position, created_at, id
    `).all(completedOn);

    const states = stateRows.map((state) => {
      const mainlines = mainlineRows
        .filter((mainline) => mainline.state_id === state.id)
        .map((mainline) => ({
          ...mapMainline(mainline),
          todos: todoRows.filter((todo) => todo.mainline_id === mainline.id).map(mapTodo),
        }));
      return {
        id: state.id,
        name: state.name,
        sortOrder: state.sort_order,
        cue: state.cue,
        currentMainlineId: state.current_mainline_id,
        priorityTodoId: state.priority_todo_id,
        startedTodoId: state.started_todo_id,
        mainlines,
        stateTodos: todoRows
          .filter((todo) => todo.state_id === state.id && todo.mainline_id === null)
          .map(mapTodo),
      };
    });

    const historyMainlines = this.db.prepare(`
      SELECT * FROM mainlines WHERE status != 'active' ORDER BY ended_at DESC, id
    `).all().map((row) => ({
      ...mapMainline(row),
      type: 'mainline',
      boundTodos: this.db.prepare(`
        SELECT todo.*, COUNT(occurrence.id) AS completion_count, 0 AS completed_today
        FROM todos AS todo
        LEFT JOIN todo_occurrences AS occurrence ON occurrence.todo_id = todo.id
        WHERE mainline_id = ? AND status != 'active'
        GROUP BY todo.id
        ORDER BY ended_at DESC, position, id
      `).all(row.id).map(mapTodo),
    }));
    const historyTodos = this.db.prepare(`
      SELECT todo.*, COUNT(occurrence.id) AS completion_count, 0 AS completed_today
      FROM todos AS todo
      LEFT JOIN todo_occurrences AS occurrence ON occurrence.todo_id = todo.id
      WHERE status != 'active'
      GROUP BY todo.id
      ORDER BY ended_at DESC, id
    `).all().map((row) => ({ ...mapTodo(row), type: 'todo', name: row.title }));
    const history = [...historyMainlines, ...historyTodos]
      .sort((left, right) => String(right.endedAt).localeCompare(String(left.endedAt)));

    return {
      version: 1,
      meta: {
        appVersion: APP_VERSION,
        schemaVersion: this.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version,
      },
      settings: {
        displayName: settings.display_name,
        avatarUrl: settings.avatar_path ? '/api/avatar' : null,
        initializedOn: settings.initialized_on,
        lastViewedStateId: settings.last_viewed_state_id,
        workspaceDensity: settings.workspace_density,
      },
      states,
      history,
    };
  }

  updateAppState({ lastViewedStateId }) {
    this.assertState(lastViewedStateId);
    this.db.prepare(`
      UPDATE app_settings SET last_viewed_state_id = ? WHERE singleton = 1
    `).run(lastViewedStateId);
    return this.snapshot();
  }

  updateSettings({ displayName, workspaceDensity }) {
    if (displayName === undefined && workspaceDensity === undefined) {
      throw new AppError(400, 'validation_error', '请选择要保存的设置。');
    }
    if (displayName !== undefined) {
      const name = requiredText(displayName, '显示名称', 40);
      this.db.prepare('UPDATE app_settings SET display_name = ? WHERE singleton = 1').run(name);
    }
    if (workspaceDensity !== undefined) {
      if (!WORKSPACE_DENSITIES.has(workspaceDensity)) {
        throw new AppError(400, 'validation_error', '工作区空间选项无效。');
      }
      this.db.prepare('UPDATE app_settings SET workspace_density = ? WHERE singleton = 1').run(workspaceDensity);
    }
    return this.snapshot();
  }

  updateState(stateId, { cue }) {
    this.assertState(stateId);
    const value = optionalText(cue, '模式 cue', 120);
    this.db.prepare('UPDATE states SET cue = ? WHERE id = ?').run(value, stateId);
    return this.snapshot();
  }

  setAvatarPath(relativePath) {
    this.db.prepare('UPDATE app_settings SET avatar_path = ? WHERE singleton = 1').run(relativePath);
    return this.snapshot();
  }

  createMainline({ stateId, slotIndex, name }) {
    return this.mutate(() => {
      const state = this.assertState(stateId);
      const slot = Number(slotIndex);
      if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
        throw new AppError(400, 'validation_error', '主线槽位必须是 1、2 或 3。');
      }
      if (this.db.prepare(`
        SELECT 1 FROM mainlines WHERE state_id = ? AND slot_index = ? AND status = 'active'
      `).get(stateId, slot)) {
        throw new AppError(409, 'slot_occupied', '这个主线槽已经被占用。');
      }

      const title = requiredText(name, '主线名称', 60);
      const id = `ml_${randomUUID()}`;
      this.db.prepare(`
        INSERT INTO mainlines(
          id, state_id, slot_index, name, normalized_name,
          goal, success_criteria, horizon, status, created_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, '', '', '', 'active', ?, NULL)
      `).run(id, stateId, slot, title, normalizeMainlineName(title), this.now());
      if (!state.current_mainline_id) {
        this.reconcilePointers(stateId, id, state.priority_todo_id);
      }
      return this.snapshot();
    });
  }

  updateMainline(id, changes) {
    return this.mutate(() => {
      this.requireMainline(id, { active: true });
      const fields = [];
      const values = [];
      if (Object.hasOwn(changes, 'name')) {
        const name = requiredText(changes.name, '主线名称', 60);
        fields.push('name = ?', 'normalized_name = ?');
        values.push(name, normalizeMainlineName(name));
      }
      if (Object.hasOwn(changes, 'goal')) {
        fields.push('goal = ?');
        values.push(optionalText(changes.goal, '一句话目标', 180));
      }
      if (Object.hasOwn(changes, 'successCriteria')) {
        fields.push('success_criteria = ?');
        values.push(optionalText(changes.successCriteria, '现阶段完成标准', 240));
      }
      if (Object.hasOwn(changes, 'horizon')) {
        fields.push('horizon = ?');
        values.push(optionalText(changes.horizon, '阶段跨度', 40));
      }
      if (!fields.length) throw new AppError(400, 'validation_error', '没有可保存的主线字段。');
      values.push(id);
      this.db.prepare(`UPDATE mainlines SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      return this.snapshot();
    });
  }

  setCurrentMainline(id) {
    return this.mutate(() => {
      const mainline = this.requireMainline(id, { active: true });
      const state = this.assertState(mainline.state_id);
      const preferred = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(state.priority_todo_id);
      const keepPriority = preferred?.status === 'active' && preferred.mainline_id === null
        ? preferred.id
        : preferred?.mainline_id === id ? preferred.id : null;
      this.db.prepare(`
        UPDATE states SET current_mainline_id = NULL, priority_todo_id = NULL, started_todo_id = NULL WHERE id = ?
      `).run(mainline.state_id);
      this.reconcilePointers(mainline.state_id, id, keepPriority);
      return this.snapshot();
    });
  }

  moveMainlineSlot(id, slotIndex) {
    return this.mutate(() => {
      const mainline = this.requireMainline(id, { active: true });
      const targetSlot = Number(slotIndex);
      if (!Number.isInteger(targetSlot) || targetSlot < 1 || targetSlot > 3) {
        throw new AppError(400, 'validation_error', '主线槽位必须是 1、2 或 3。');
      }
      if (targetSlot === mainline.slot_index) return this.snapshot();
      const occupant = this.db.prepare(`
        SELECT * FROM mainlines
        WHERE state_id = ? AND slot_index = ? AND status = 'active'
      `).get(mainline.state_id, targetSlot);
      if (occupant) {
        const temporaryEnd = this.now();
        this.db.prepare(`
          UPDATE mainlines SET status = 'abandoned', ended_at = ? WHERE id = ?
        `).run(temporaryEnd, occupant.id);
        this.db.prepare('UPDATE mainlines SET slot_index = ? WHERE id = ?').run(targetSlot, mainline.id);
        this.db.prepare(`
          UPDATE mainlines SET slot_index = ?, status = 'active', ended_at = NULL WHERE id = ?
        `).run(mainline.slot_index, occupant.id);
      } else {
        this.db.prepare('UPDATE mainlines SET slot_index = ? WHERE id = ?').run(targetSlot, id);
      }
      return this.snapshot();
    });
  }

  endMainline(id, { status, resolutions = {} }) {
    return this.mutate(() => {
      const mainline = this.requireMainline(id, { active: true });
      if (!END_STATUSES.has(status)) {
        throw new AppError(400, 'validation_error', '主线只能标记为 completed 或 abandoned。');
      }
      const state = this.assertState(mainline.state_id);
      const preferredPriorityId = state.priority_todo_id;
      this.db.prepare(`
        UPDATE states SET current_mainline_id = NULL, priority_todo_id = NULL, started_todo_id = NULL WHERE id = ?
      `).run(mainline.state_id);

      const activeTodos = this.db.prepare(`
        SELECT * FROM todos WHERE mainline_id = ? AND status = 'active' ORDER BY position
      `).all(id);
      for (const todo of activeTodos) {
        const resolution = resolutions[todo.id] ?? { target: 'abandon' };
        if (resolution.target === 'state') {
          this.db.prepare(`
            UPDATE todos SET mainline_id = NULL, position = ? WHERE id = ?
          `).run(this.nextPosition(mainline.state_id, null), todo.id);
        } else if (resolution.target === 'mainline') {
          const target = this.requireMainline(resolution.mainlineId, { active: true });
          if (target.state_id !== mainline.state_id || target.id === id) {
            throw new AppError(409, 'state_mismatch', '剩余事项只能移到同模式的另一条主线。');
          }
          this.db.prepare(`
            UPDATE todos SET mainline_id = ?, position = ? WHERE id = ?
          `).run(target.id, this.nextPosition(mainline.state_id, target.id), todo.id);
        } else if (resolution.target === 'abandon') {
          this.db.prepare(`
            UPDATE todos SET status = 'abandoned', ended_at = ? WHERE id = ?
          `).run(this.now(), todo.id);
        } else {
          throw new AppError(400, 'validation_error', '未知的剩余事项处理方式。');
        }
      }

      this.db.prepare(`
        UPDATE mainlines SET status = ?, ended_at = ? WHERE id = ?
      `).run(status, this.now(), id);
      this.renumberScope(mainline.state_id, null);
      for (const remaining of this.db.prepare(`
        SELECT id FROM mainlines WHERE state_id = ? AND status = 'active'
      `).all(mainline.state_id)) this.renumberScope(mainline.state_id, remaining.id);

      const currentId = state.current_mainline_id === id
        ? this.firstActiveMainline(mainline.state_id, id)
        : state.current_mainline_id;
      this.reconcilePointers(mainline.state_id, currentId, preferredPriorityId);
      return this.snapshot();
    });
  }

  deleteMainline(id, { todoPolicy = 'move_to_state' } = {}) {
    return this.mutate(() => {
      const mainline = this.requireMainline(id);
      if (!['move_to_state', 'delete'].includes(todoPolicy)) {
        throw new AppError(400, 'validation_error', '未知的事项删除策略。');
      }
      const state = this.assertState(mainline.state_id);
      const preferredPriorityId = state.priority_todo_id;
      this.db.prepare(`
        UPDATE states SET current_mainline_id = NULL, priority_todo_id = NULL, started_todo_id = NULL WHERE id = ?
      `).run(mainline.state_id);

      const boundTodos = this.db.prepare(`
        SELECT * FROM todos WHERE mainline_id = ? ORDER BY status, position
      `).all(id);
      if (todoPolicy === 'delete') {
        this.db.prepare('DELETE FROM todos WHERE mainline_id = ?').run(id);
      } else {
        for (const todo of boundTodos) {
          const position = todo.status === 'active'
            ? this.nextPosition(mainline.state_id, null)
            : todo.position;
          this.db.prepare(`
            UPDATE todos SET mainline_id = NULL, position = ? WHERE id = ?
          `).run(position, todo.id);
        }
      }
      this.db.prepare('DELETE FROM mainlines WHERE id = ?').run(id);
      this.renumberScope(mainline.state_id, null);
      const currentId = state.current_mainline_id === id
        ? this.firstActiveMainline(mainline.state_id, id)
        : state.current_mainline_id;
      this.reconcilePointers(mainline.state_id, currentId, preferredPriorityId);
      return this.snapshot();
    });
  }

  copyMainline(id, { name }) {
    return this.mutate(() => {
      const source = this.requireMainline(id);
      if (source.status === 'active') {
        throw new AppError(409, 'mainline_is_active', '只有行迹中的主线可以复制为新主线。');
      }
      const occupied = new Set(this.db.prepare(`
        SELECT slot_index FROM mainlines WHERE state_id = ? AND status = 'active'
      `).all(source.state_id).map((row) => row.slot_index));
      const slot = [1, 2, 3].find((candidate) => !occupied.has(candidate));
      if (!slot) throw new AppError(409, 'no_empty_slot', '这个模式的三个主线槽都已占用。');
      const title = requiredText(name, '新主线名称', 60);
      const newId = `ml_${randomUUID()}`;
      this.db.prepare(`
        INSERT INTO mainlines(
          id, state_id, slot_index, name, normalized_name,
          goal, success_criteria, horizon, status, created_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL)
      `).run(
        newId,
        source.state_id,
        slot,
        title,
        normalizeMainlineName(title),
        source.goal,
        source.success_criteria,
        source.horizon,
        this.now(),
      );
      const state = this.assertState(source.state_id);
      if (!state.current_mainline_id) {
        this.reconcilePointers(source.state_id, newId, state.priority_todo_id);
      }
      return this.snapshot();
    });
  }

  createTodo({ stateId, mainlineId = null, title, minimalStep = '', kind = 'single' }) {
    return this.mutate(() => {
      const state = this.assertState(stateId);
      if (mainlineId) {
        const mainline = this.requireMainline(mainlineId, { active: true });
        if (mainline.state_id !== stateId) {
          throw new AppError(409, 'state_mismatch', '事项不能创建到其他模式的主线。');
        }
      }
      const id = `td_${randomUUID()}`;
      if (!TODO_KINDS.has(kind)) {
        throw new AppError(400, 'validation_error', '事项类型只能是一次事项或持续事项。');
      }
      this.db.prepare(`
        INSERT INTO todos(
          id, state_id, mainline_id, title, minimal_step, kind, status, position, created_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
      `).run(
        id,
        stateId,
        mainlineId,
        requiredText(title, '事项名称', 160),
        optionalText(minimalStep, '最小一步', 160),
        kind,
        this.nextPosition(stateId, mainlineId),
        this.now(),
      );
      if (!state.priority_todo_id && (mainlineId === null || mainlineId === state.current_mainline_id)) {
        this.reconcilePointers(stateId, state.current_mainline_id, id);
      }
      return this.snapshot();
    });
  }

  updateTodo(id, changes) {
    const todo = this.requireTodo(id, { active: true });
    const fields = [];
    const values = [];
    if (Object.hasOwn(changes, 'title')) {
      fields.push('title = ?');
      values.push(requiredText(changes.title, '事项名称', 160));
    }
    if (Object.hasOwn(changes, 'minimalStep')) {
      fields.push('minimal_step = ?');
      values.push(optionalText(changes.minimalStep, '最小一步', 160));
    }
    if (Object.hasOwn(changes, 'kind')) {
      if (!TODO_KINDS.has(changes.kind)) {
        throw new AppError(400, 'validation_error', '事项类型只能是一次事项或持续事项。');
      }
      if (todo.kind === 'ongoing' && changes.kind === 'single') {
        throw new AppError(409, 'ongoing_kind_is_stable', '持续事项不能直接改回一次事项；请结束它后创建新的事项。');
      }
      fields.push('kind = ?');
      values.push(changes.kind);
    }
    if (!fields.length) throw new AppError(400, 'validation_error', '没有可保存的事项字段。');
    values.push(id);
    this.db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.snapshot();
  }

  endTodo(id, status) {
    return this.mutate(() => {
      const todo = this.requireTodo(id, { active: true });
      if (!END_STATUSES.has(status)) {
        throw new AppError(400, 'validation_error', '事项只能标记为 completed 或 abandoned。');
      }
      const state = this.assertState(todo.state_id);
      if (state.priority_todo_id === id) {
        this.db.prepare('UPDATE states SET priority_todo_id = NULL, started_todo_id = NULL WHERE id = ?').run(todo.state_id);
      }
      this.db.prepare('UPDATE todos SET status = ?, ended_at = ? WHERE id = ?')
        .run(status, this.now(), id);
      this.renumberScope(todo.state_id, todo.mainline_id);
      this.reconcilePointers(todo.state_id, state.current_mainline_id, state.priority_todo_id === id ? null : state.priority_todo_id);
      return this.snapshot();
    });
  }

  recordTodoOccurrence(id) {
    return this.mutate(() => {
      const todo = this.requireTodo(id, { active: true });
      if (todo.kind !== 'ongoing') {
        throw new AppError(409, 'todo_is_not_ongoing', '只有持续事项可以记录今天完成。');
      }
      const completedOn = this.localDate();
      if (this.db.prepare(`
        SELECT 1 FROM todo_occurrences WHERE todo_id = ? AND completed_on = ?
      `).get(id, completedOn)) {
        throw new AppError(409, 'already_completed_today', '这条持续事项今天已经完成过一次。');
      }
      const state = this.assertState(todo.state_id);
      this.db.prepare(`
        INSERT INTO todo_occurrences(id, todo_id, completed_on, completed_at)
        VALUES (?, ?, ?, ?)
      `).run(`oc_${randomUUID()}`, id, completedOn, this.now());
      if (state.priority_todo_id === id) {
        this.db.prepare('UPDATE states SET priority_todo_id = NULL, started_todo_id = NULL WHERE id = ?').run(todo.state_id);
      }
      this.reconcilePointers(
        todo.state_id,
        state.current_mainline_id,
        state.priority_todo_id === id ? null : state.priority_todo_id,
      );
      return this.snapshot();
    });
  }

  undoTodoOccurrence(id) {
    return this.mutate(() => {
      const todo = this.requireTodo(id, { active: true });
      if (todo.kind !== 'ongoing') {
        throw new AppError(409, 'todo_is_not_ongoing', '只有持续事项可以撤回今天的记录。');
      }
      const result = this.db.prepare(`
        DELETE FROM todo_occurrences WHERE todo_id = ? AND completed_on = ?
      `).run(id, this.localDate());
      if (!result.changes) {
        throw new AppError(409, 'not_completed_today', '这条持续事项今天还没有完成记录。');
      }
      const state = this.assertState(todo.state_id);
      this.reconcilePointers(todo.state_id, state.current_mainline_id, state.priority_todo_id ?? id);
      return this.snapshot();
    });
  }

  reopenTodo(id) {
    return this.mutate(() => {
      const todo = this.requireTodo(id);
      if (todo.status === 'active') {
        throw new AppError(409, 'todo_is_active', '这条事项已经在进行中。');
      }
      const state = this.assertState(todo.state_id);
      const originalMainline = todo.mainline_id
        ? this.db.prepare(`
            SELECT id FROM mainlines
            WHERE id = ? AND state_id = ? AND status = 'active'
          `).get(todo.mainline_id, todo.state_id)
        : null;
      const mainlineId = originalMainline?.id ?? null;
      this.db.prepare(`
        UPDATE todos
        SET mainline_id = ?, status = 'active', position = ?, ended_at = NULL
        WHERE id = ?
      `).run(mainlineId, this.nextPosition(todo.state_id, mainlineId), id);
      this.reconcilePointers(todo.state_id, state.current_mainline_id, state.priority_todo_id);
      return this.snapshot();
    });
  }

  deleteTodo(id) {
    return this.mutate(() => {
      const todo = this.requireTodo(id);
      const state = this.assertState(todo.state_id);
      if (state.priority_todo_id === id) {
        this.db.prepare('UPDATE states SET priority_todo_id = NULL, started_todo_id = NULL WHERE id = ?').run(todo.state_id);
      }
      this.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
      if (todo.status === 'active') this.renumberScope(todo.state_id, todo.mainline_id);
      this.reconcilePointers(todo.state_id, state.current_mainline_id, state.priority_todo_id === id ? null : state.priority_todo_id);
      return this.snapshot();
    });
  }

  moveTodo(id, { mainlineId = null, position = 1 }) {
    return this.mutate(() => {
      const todo = this.requireTodo(id, { active: true });
      const state = this.assertState(todo.state_id);
      if (mainlineId) {
        const mainline = this.requireMainline(mainlineId, { active: true });
        if (mainline.state_id !== todo.state_id) {
          throw new AppError(409, 'state_mismatch', '事项不能移动到其他模式。');
        }
      }
      const requestedPosition = Number(position);
      if (!Number.isInteger(requestedPosition) || requestedPosition < 1) {
        throw new AppError(400, 'validation_error', '事项排序位置必须是正整数。');
      }
      if (state.priority_todo_id === id) {
        this.db.prepare('UPDATE states SET priority_todo_id = NULL, started_todo_id = NULL WHERE id = ?').run(todo.state_id);
      }
      const oldMainlineId = todo.mainline_id;
      this.db.prepare('UPDATE todos SET mainline_id = ?, position = ? WHERE id = ?')
        .run(mainlineId, 2147483647, id);
      this.renumberScope(todo.state_id, oldMainlineId);

      const targetRows = mainlineId === null
        ? this.db.prepare(`
            SELECT id FROM todos
            WHERE state_id = ? AND mainline_id IS NULL AND status = 'active' AND id != ?
            ORDER BY position, created_at, id
          `).all(todo.state_id, id)
        : this.db.prepare(`
            SELECT id FROM todos
            WHERE state_id = ? AND mainline_id = ? AND status = 'active' AND id != ?
            ORDER BY position, created_at, id
          `).all(todo.state_id, mainlineId, id);
      const ids = targetRows.map((row) => row.id);
      ids.splice(Math.min(requestedPosition - 1, ids.length), 0, id);
      const update = this.db.prepare('UPDATE todos SET position = ? WHERE id = ?');
      ids.forEach((todoId, index) => update.run(index + 1, todoId));
      this.reconcilePointers(todo.state_id, state.current_mainline_id, state.priority_todo_id);
      return this.snapshot();
    });
  }

  setPriorityTodo(id) {
    return this.mutate(() => {
      const todo = this.requireTodo(id, { active: true });
      const state = this.assertState(todo.state_id);
      if (todo.mainline_id !== null && todo.mainline_id !== state.current_mainline_id) {
        throw new AppError(409, 'priority_not_eligible', '下一步只能来自当前主线事项或其他事项。');
      }
      this.db.prepare(`
        UPDATE states
        SET priority_todo_id = ?,
            started_todo_id = CASE WHEN started_todo_id = ? THEN started_todo_id ELSE NULL END
        WHERE id = ?
      `).run(id, id, todo.state_id);
      return this.snapshot();
    });
  }

  startPriorityTodo(id) {
    return this.mutate(() => {
      const todo = this.requireTodo(id, { active: true });
      const state = this.assertState(todo.state_id);
      if (state.priority_todo_id !== id) {
        throw new AppError(409, 'todo_is_not_priority', '只能开始当前的下一步。');
      }
      this.db.prepare('UPDATE states SET started_todo_id = ? WHERE id = ?').run(id, todo.state_id);
      return this.snapshot();
    });
  }

  pausePriorityTodo(id) {
    return this.mutate(() => {
      const todo = this.requireTodo(id, { active: true });
      const state = this.assertState(todo.state_id);
      if (state.started_todo_id !== id) {
        throw new AppError(409, 'todo_is_not_started', '这件事当前没有在进行。');
      }
      this.db.prepare('UPDATE states SET started_todo_id = NULL WHERE id = ?').run(todo.state_id);
      return this.snapshot();
    });
  }

  exportReadable() {
    return {
      format: 'SUOWANG readable export',
      schemaVersion: this.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version,
      exportedAt: this.now(),
      appSettings: this.db.prepare('SELECT * FROM app_settings WHERE singleton = 1').get(),
      states: this.db.prepare('SELECT * FROM states ORDER BY sort_order').all(),
      mainlines: this.db.prepare('SELECT * FROM mainlines ORDER BY created_at, id').all(),
      todos: this.db.prepare('SELECT * FROM todos ORDER BY created_at, id').all(),
      todoOccurrences: this.db.prepare('SELECT * FROM todo_occurrences ORDER BY completed_at, id').all(),
    };
  }
}
