import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AppError } from '../src/server/service.mjs';
import { createServiceHarness, findMainline } from './helpers.mjs';

test('a new database contains only the immutable states and honest settings', (context) => {
  const { runtime, service } = createServiceHarness(context);
  const snapshot = service.snapshot();
  assert.deepEqual(snapshot.states.map((state) => state.id), ['restore', 'work', 'life']);
  assert.deepEqual(snapshot.states.map((state) => state.mainlines), [[], [], []]);
  assert.deepEqual(snapshot.states.map((state) => state.stateTodos), [[], [], []]);
  assert.equal(snapshot.settings.lastViewedStateId, 'work');
  assert.equal(snapshot.settings.workspaceDensity, 'small');
  assert.throws(
    () => runtime.db.prepare("UPDATE states SET name = '别名' WHERE id = 'work'").run(),
    /state_identity_is_immutable/,
  );
});

test('workspace density is a persisted display preference with a fixed option set', (context) => {
  const { service } = createServiceHarness(context);
  let snapshot = service.updateSettings({ workspaceDensity: 'large' });
  assert.equal(snapshot.settings.workspaceDensity, 'large');
  snapshot = service.updateSettings({ displayName: '所往用户' });
  assert.equal(snapshot.settings.displayName, '所往用户');
  assert.equal(snapshot.settings.workspaceDensity, 'large');
  assert.throws(
    () => service.updateSettings({ workspaceDensity: 'huge' }),
    (error) => error instanceof AppError && error.code === 'validation_error',
  );
});

test('mainlines use three stable slots, swap without reordering, and keep names globally unique', (context) => {
  const { service } = createServiceHarness(context);
  let snapshot = service.createMainline({ stateId: 'work', slotIndex: 1, name: '第一战役' });
  snapshot = service.createMainline({ stateId: 'work', slotIndex: 2, name: '第二战役' });
  snapshot = service.createMainline({ stateId: 'work', slotIndex: 3, name: '第三战役' });
  const state = snapshot.states.find((item) => item.id === 'work');
  assert.equal(state.currentMainlineId, findMainline(snapshot, 'work', '第一战役').id);
  assert.deepEqual(state.mainlines.map((mainline) => mainline.name), ['第一战役', '第二战役', '第三战役']);

  assert.throws(
    () => service.createMainline({ stateId: 'work', slotIndex: 3, name: '第四战役' }),
    (error) => error instanceof AppError && error.code === 'slot_occupied',
  );

  const firstId = findMainline(snapshot, 'work', '第一战役').id;
  snapshot = service.moveMainlineSlot(firstId, 3);
  assert.deepEqual(
    snapshot.states.find((item) => item.id === 'work').mainlines.map((mainline) => [mainline.slotIndex, mainline.name]),
    [[1, '第三战役'], [2, '第二战役'], [3, '第一战役']],
  );
  assert.equal(snapshot.states.find((item) => item.id === 'work').currentMainlineId, firstId);

  assert.throws(
    () => service.updateMainline(firstId, { name: ' 第二战役 ' }),
    (error) => error instanceof AppError && error.code === 'duplicate_mainline_name',
  );
});

test('current and priority remain per-state pointers with deterministic fallback', (context) => {
  const { service } = createServiceHarness(context);
  let snapshot = service.createMainline({ stateId: 'work', slotIndex: 1, name: '主线 A' });
  snapshot = service.createMainline({ stateId: 'work', slotIndex: 2, name: '主线 B' });
  const a = findMainline(snapshot, 'work', '主线 A');
  const b = findMainline(snapshot, 'work', '主线 B');
  snapshot = service.createTodo({ stateId: 'work', mainlineId: a.id, title: 'A 的第一步' });
  const aTodo = findMainline(snapshot, 'work', '主线 A').todos[0];
  snapshot = service.createTodo({ stateId: 'work', title: '工作通用事项' });
  const stateTodo = snapshot.states.find((state) => state.id === 'work').stateTodos[0];
  snapshot = service.createTodo({ stateId: 'work', mainlineId: b.id, title: 'B 的第一步' });
  const bTodo = findMainline(snapshot, 'work', '主线 B').todos[0];
  assert.equal(snapshot.states.find((state) => state.id === 'work').priorityTodoId, aTodo.id);

  snapshot = service.setCurrentMainline(b.id);
  assert.equal(snapshot.states.find((state) => state.id === 'work').priorityTodoId, bTodo.id);
  snapshot = service.setPriorityTodo(stateTodo.id);
  snapshot = service.setCurrentMainline(a.id);
  assert.equal(snapshot.states.find((state) => state.id === 'work').priorityTodoId, stateTodo.id);

  snapshot = service.moveTodo(stateTodo.id, { mainlineId: b.id, position: 1 });
  assert.equal(snapshot.states.find((state) => state.id === 'work').priorityTodoId, aTodo.id);

  snapshot = service.createMainline({ stateId: 'life', slotIndex: 1, name: '生活实验' });
  snapshot = service.updateAppState({ lastViewedStateId: 'life' });
  assert.equal(snapshot.settings.lastViewedStateId, 'life');
  assert.equal(snapshot.states.find((state) => state.id === 'work').currentMainlineId, a.id);
});

test('todos keep an optional minimal step through create, edit, priority, and history', (context) => {
  const { service } = createServiceHarness(context);
  let snapshot = service.createMainline({ stateId: 'work', slotIndex: 1, name: '写作' });
  const mainline = findMainline(snapshot, 'work', '写作');
  snapshot = service.createTodo({
    stateId: 'work',
    mainlineId: mainline.id,
    title: '写公众号文章',
    minimalStep: '打开文档写 50 字',
  });
  let todo = findMainline(snapshot, 'work', '写作').todos[0];
  assert.equal(todo.minimalStep, '打开文档写 50 字');
  assert.equal(snapshot.states.find((state) => state.id === 'work').priorityTodoId, todo.id);

  snapshot = service.updateTodo(todo.id, { minimalStep: '只写三个标题' });
  todo = findMainline(snapshot, 'work', '写作').todos[0];
  assert.equal(todo.title, '写公众号文章');
  assert.equal(todo.minimalStep, '只写三个标题');

  snapshot = service.endTodo(todo.id, 'completed');
  const historyTodo = snapshot.history.find((item) => item.id === todo.id);
  assert.equal(historyTodo.minimalStep, '只写三个标题');
});

test('ongoing todos record at most once per local day and keep an honest count', (context) => {
  const { runtime, service } = createServiceHarness(context);
  let current = new Date('2026-08-21T21:30:00.000Z');
  service.clock = () => current;
  let snapshot = service.createMainline({ stateId: 'restore', slotIndex: 1, name: '稳定作息' });
  const mainline = findMainline(snapshot, 'restore', '稳定作息');
  snapshot = service.createTodo({
    stateId: 'restore', mainlineId: mainline.id, title: '23点前睡觉', kind: 'ongoing',
  });
  snapshot = service.createTodo({
    stateId: 'restore', mainlineId: mainline.id, title: '收好手机',
  });
  const ongoing = findMainline(snapshot, 'restore', '稳定作息').todos[0];
  assert.equal(ongoing.kind, 'ongoing');
  assert.equal(ongoing.completionCount, 0);
  assert.equal(ongoing.completedToday, false);

  snapshot = service.recordTodoOccurrence(ongoing.id);
  let recorded = findMainline(snapshot, 'restore', '稳定作息').todos[0];
  assert.equal(recorded.status, 'active');
  assert.equal(recorded.completionCount, 1);
  assert.equal(recorded.completedToday, true);
  assert.notEqual(snapshot.states.find((state) => state.id === 'restore').priorityTodoId, ongoing.id);
  assert.throws(
    () => service.recordTodoOccurrence(ongoing.id),
    (error) => error instanceof AppError && error.code === 'already_completed_today',
  );

  snapshot = service.undoTodoOccurrence(ongoing.id);
  recorded = findMainline(snapshot, 'restore', '稳定作息').todos[0];
  assert.equal(recorded.completionCount, 0);
  assert.equal(recorded.completedToday, false);

  service.recordTodoOccurrence(ongoing.id);
  current = new Date('2026-08-22T21:30:00.000Z');
  snapshot = service.recordTodoOccurrence(ongoing.id);
  recorded = findMainline(snapshot, 'restore', '稳定作息').todos[0];
  assert.equal(recorded.completionCount, 2);
  assert.equal(recorded.completedToday, true);

  snapshot = service.endTodo(ongoing.id, 'completed');
  const history = snapshot.history.find((item) => item.id === ongoing.id);
  assert.equal(history.kind, 'ongoing');
  assert.equal(history.completionCount, 2);
  service.deleteTodo(ongoing.id);
  assert.equal(runtime.db.prepare('SELECT COUNT(*) AS count FROM todo_occurrences').get().count, 0);
});

test('historical todos can be reopened without reviving a historical mainline', (context) => {
  const { service } = createServiceHarness(context);
  let snapshot = service.createMainline({ stateId: 'work', slotIndex: 1, name: '可撤回主线' });
  const mainline = findMainline(snapshot, 'work', '可撤回主线');
  snapshot = service.createTodo({ stateId: 'work', mainlineId: mainline.id, title: '容易误点的事项' });
  const todoId = findMainline(snapshot, 'work', '可撤回主线').todos[0].id;

  snapshot = service.endTodo(todoId, 'completed');
  assert.equal(snapshot.history.find((item) => item.type === 'todo' && item.id === todoId).status, 'completed');
  snapshot = service.reopenTodo(todoId);
  const reopenedInMainline = findMainline(snapshot, 'work', '可撤回主线').todos[0];
  assert.equal(reopenedInMainline.id, todoId);
  assert.equal(reopenedInMainline.status, 'active');
  assert.equal(reopenedInMainline.endedAt, null);
  assert.equal(snapshot.history.some((item) => item.type === 'todo' && item.id === todoId), false);

  snapshot = service.endMainline(mainline.id, { status: 'completed', resolutions: {} });
  assert.equal(snapshot.history.find((item) => item.type === 'todo' && item.id === todoId).status, 'abandoned');
  snapshot = service.reopenTodo(todoId);
  const reopenedAsStateTodo = snapshot.states.find((state) => state.id === 'work').stateTodos[0];
  assert.equal(reopenedAsStateTodo.id, todoId);
  assert.equal(reopenedAsStateTodo.mainlineId, null);
  assert.throws(
    () => service.reopenTodo(todoId),
    (error) => error instanceof AppError && error.code === 'todo_is_active',
  );
});

test('ending a current mainline resolves active todos without inventing completion', (context) => {
  const { service } = createServiceHarness(context);
  let snapshot = service.createMainline({ stateId: 'work', slotIndex: 1, name: '阶段 A' });
  snapshot = service.createMainline({ stateId: 'work', slotIndex: 2, name: '阶段 B' });
  const a = findMainline(snapshot, 'work', '阶段 A');
  const b = findMainline(snapshot, 'work', '阶段 B');
  snapshot = service.createTodo({ stateId: 'work', mainlineId: a.id, title: '转为通用' });
  snapshot = service.createTodo({ stateId: 'work', mainlineId: a.id, title: '转到 B' });
  snapshot = service.createTodo({ stateId: 'work', mainlineId: a.id, title: '默认放弃' });
  const [toState, toB, abandon] = findMainline(snapshot, 'work', '阶段 A').todos;

  snapshot = service.endMainline(a.id, {
    status: 'completed',
    resolutions: {
      [toState.id]: { target: 'state' },
      [toB.id]: { target: 'mainline', mainlineId: b.id },
    },
  });
  const work = snapshot.states.find((state) => state.id === 'work');
  assert.equal(work.currentMainlineId, b.id);
  assert.equal(work.priorityTodoId, toState.id);
  assert.deepEqual(work.stateTodos.map((todo) => todo.id), [toState.id]);
  assert.deepEqual(findMainline(snapshot, 'work', '阶段 B').todos.map((todo) => todo.id), [toB.id]);
  const abandonedHistory = snapshot.history.find((item) => item.type === 'todo' && item.id === abandon.id);
  assert.equal(abandonedHistory.status, 'abandoned');
  assert.ok(snapshot.history.some((item) => item.type === 'mainline' && item.id === a.id && item.status === 'completed'));
});

test('hard delete moves bound todos to the state by default and can delete them explicitly', (context) => {
  const { service } = createServiceHarness(context);
  let snapshot = service.createMainline({ stateId: 'restore', slotIndex: 1, name: '恢复试验' });
  const mainline = findMainline(snapshot, 'restore', '恢复试验');
  snapshot = service.createTodo({ stateId: 'restore', mainlineId: mainline.id, title: '保留的 Todo' });
  const todoId = findMainline(snapshot, 'restore', '恢复试验').todos[0].id;
  snapshot = service.deleteMainline(mainline.id);
  assert.deepEqual(snapshot.states.find((state) => state.id === 'restore').stateTodos.map((todo) => todo.id), [todoId]);

  snapshot = service.createMainline({ stateId: 'restore', slotIndex: 1, name: '纠错主线' });
  const correction = findMainline(snapshot, 'restore', '纠错主线');
  snapshot = service.createTodo({ stateId: 'restore', mainlineId: correction.id, title: '一并删除' });
  const deletedTodoId = findMainline(snapshot, 'restore', '纠错主线').todos[0].id;
  snapshot = service.deleteMainline(correction.id, { todoPolicy: 'delete' });
  assert.equal(snapshot.states.find((state) => state.id === 'restore').stateTodos.some((todo) => todo.id === deletedTodoId), false);
});

test('SQLite backup and whole-database restore recover the previous facts', async (context) => {
  const { dataDir, runtime, service } = createServiceHarness(context);
  let snapshot = service.createMainline({ stateId: 'life', slotIndex: 1, name: '可恢复主线' });
  const id = findMainline(snapshot, 'life', '可恢复主线').id;
  const backup = join(dataDir, 'manual-test.db');
  await runtime.backupTo(backup);
  service.deleteMainline(id, { todoPolicy: 'delete' });
  assert.equal(service.snapshot().states.find((state) => state.id === 'life').mainlines.length, 0);

  const result = await runtime.restoreFrom(backup, new Date('2026-08-21T12:00:00.000Z'));
  assert.ok(existsSync(result.safetyBackup));
  assert.equal(findMainline(service.snapshot(), 'life', '可恢复主线').id, id);
});

test('automatic backup runs once per local day and retains the latest thirty copies', async (context) => {
  const { runtime } = createServiceHarness(context);
  const first = await runtime.ensureDailyBackup(new Date(2026, 7, 1, 9));
  const repeated = await runtime.ensureDailyBackup(new Date(2026, 7, 1, 22));
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);

  for (let day = 2; day <= 31; day += 1) {
    await runtime.ensureDailyBackup(new Date(2026, 7, day, 9));
  }
  const automatic = readdirSync(runtime.backupsDir)
    .filter((name) => /^suowang-\d{4}-\d{2}-\d{2}\.db$/.test(name))
    .sort();
  assert.equal(automatic.length, 30);
  assert.equal(automatic[0], 'suowang-2026-08-02.db');
  assert.equal(automatic.at(-1), 'suowang-2026-08-31.db');
});
