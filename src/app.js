import { api } from './api.js';
import {
  currentMainline,
  focusDays,
  formatLocalDate,
  greetingForHour,
  priorityTodo,
  stateById,
  stateIdFromNavigationKey,
  stateName,
  statusLabel,
  todoSource,
  typeLabel,
} from './view-model.js';

const ui = {
  snapshot: null,
  activeStateId: null,
  page: 'dashboard',
  createSlot: null,
  drag: null,
  endAction: null,
  dialogAction: null,
  expandedHistory: new Set(),
};

const byId = (id) => document.getElementById(id);
const html = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function activeState() {
  return stateById(ui.snapshot, ui.activeStateId);
}

function mainlineById(id) {
  return ui.snapshot.states.flatMap((state) => state.mainlines).find((mainline) => mainline.id === id) ?? null;
}

function todoById(id) {
  for (const state of ui.snapshot.states) {
    const stateTodo = state.stateTodos.find((todo) => todo.id === id);
    if (stateTodo) return stateTodo;
    for (const mainline of state.mainlines) {
      const todo = mainline.todos.find((item) => item.id === id);
      if (todo) return todo;
    }
  }
  return null;
}

function setBusy(value) {
  document.body.classList.toggle('busy', value);
  document.body.setAttribute('aria-busy', String(value));
}

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function showError(title, error) {
  byId('error-title').textContent = title;
  byId('error-message').textContent = error?.message ?? String(error);
  byId('error-banner').hidden = false;
}

function applySnapshot(snapshot) {
  ui.snapshot = snapshot;
  if (!stateById(snapshot, ui.activeStateId)) {
    ui.activeStateId = snapshot.settings.lastViewedStateId;
  }
  renderAll();
}

async function mutate(operation, successMessage) {
  setBusy(true);
  closeContextMenu();
  try {
    const snapshot = await operation();
    applySnapshot(snapshot);
    if (successMessage) showToast(successMessage);
    return snapshot;
  } catch (error) {
    showError('操作没有完成', error);
    return null;
  } finally {
    setBusy(false);
  }
}

function renderChrome(now = new Date()) {
  const { settings } = ui.snapshot;
  byId('greeting').textContent = `${greetingForHour(now.getHours())}，${settings.displayName}`;
  byId('local-date').textContent = formatLocalDate(now);
  byId('profile-name').textContent = settings.displayName;
  byId('focus-days').textContent = `专注中 · ${focusDays(settings.initializedOn, now)}天`;
  const avatar = byId('profile-avatar');
  if (settings.avatarUrl) {
    avatar.innerHTML = `<img src="${settings.avatarUrl}?v=${Date.now()}" alt="" />`;
  } else {
    avatar.textContent = settings.displayName.trim().slice(0, 1).toUpperCase() || 'S';
  }
}

function navigate(page) {
  ui.page = page;
  document.querySelectorAll('[data-page]').forEach((button) => {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-page-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.pagePanel !== page;
  });
  if (page === 'history') renderHistory();
  if (page === 'settings') renderSettings();
}

function renderStateControls(state) {
  byId('route-tabs').innerHTML = ui.snapshot.states.map((item) => {
    const selected = item.id === state.id;
    return `
    <button class="route-tab" type="button" role="tab" data-state-id="${item.id}"
      aria-selected="${selected}" tabindex="${selected ? 0 : -1}"
      aria-label="${selected ? `${html(item.name)}，当前状态` : `切换到${html(item.name)}状态`}">
      <span class="route-tab-label">
        <strong>${html(item.name)}</strong>
        ${selected ? '<small>当前</small>' : ''}
      </span>
    </button>
  `;
  }).join('');
  document.querySelectorAll('[data-road-scene]').forEach((layer) => {
    layer.classList.toggle('selected', layer.dataset.roadScene === state.id);
  });
  byId('state-cue').textContent = state.cue || `${state.name}状态暂未设置 cue`;
}

function renderMainlineSlots(state) {
  const current = currentMainline(state);
  const deck = byId('mainline-deck');
  deck.style.setProperty('--current-slot', current?.slotIndex ?? 2);
  byId('mainline-slots').innerHTML = [1, 2, 3].map((slotIndex) => {
    const mainline = state.mainlines.find((item) => item.slotIndex === slotIndex);
    if (mainline) {
      return `
        <div class="mainline-slot" data-slot-index="${slotIndex}">
          <div class="mainline-card ${mainline.id === state.currentMainlineId ? 'current' : ''}"
            role="button" tabindex="0" draggable="true" data-mainline-id="${mainline.id}"
            aria-label="${html(mainline.name)}${mainline.id === state.currentMainlineId ? '，当前主线' : '，点击设为当前主线'}">
            ${mainline.id === state.currentMainlineId ? '<small>CURRENT</small>' : '<small>&nbsp;</small>'}
            <span class="mainline-name">${html(mainline.name)}</span>
            <button class="mainline-more" type="button" data-mainline-menu="${mainline.id}" aria-label="${html(mainline.name)}的更多操作">•••</button>
          </div>
        </div>
      `;
    }
    if (ui.createSlot === slotIndex) {
      return `
        <div class="mainline-slot" data-slot-index="${slotIndex}">
          <form class="create-mainline-form" data-create-slot="${slotIndex}">
            <label class="visually-hidden">新主线名称</label>
            <input maxlength="60" required autocomplete="off" placeholder="主线名称" />
            <button type="submit">创建</button>
          </form>
        </div>
      `;
    }
    return `
      <div class="mainline-slot" data-slot-index="${slotIndex}">
        <button class="empty-mainline" type="button" data-empty-slot="${slotIndex}" aria-label="在槽位 ${slotIndex} 创建主线">＋</button>
      </div>
    `;
  }).join('');
  if (ui.createSlot) {
    requestAnimationFrame(() => document.querySelector(`[data-create-slot="${ui.createSlot}"] input`)?.focus());
  }
}

function renderCurrentDetail(state) {
  const current = currentMainline(state);
  const container = byId('current-detail');
  if (!current) {
    container.innerHTML = '<p class="detail-empty">创建一条主线，它会自动成为 Current。</p>';
    return;
  }
  const fields = [
    ['name', '主线名称', current.name, '输入主线名称'],
    ['goal', '一句话目标', current.goal, '添加一句话目标'],
    ['successCriteria', '完成标准', current.successCriteria, '添加完成标准'],
    ['horizon', '阶段跨度', current.horizon, '添加阶段跨度'],
  ];
  container.innerHTML = fields.map(([field, label, value, placeholder]) => `
    <button class="detail-field" type="button" data-edit-mainline="${current.id}" data-field="${field}" data-value="${html(value)}">
      <small>${label}</small>
      <span class="${value ? '' : 'placeholder'}">${html(value || placeholder)}</span>
    </button>
  `).join('');
}

function todoRow(todo) {
  return `
    <div class="todo-row" draggable="true" tabindex="0" data-todo-id="${todo.id}" aria-label="Todo：${html(todo.title)}">
      <button class="todo-title" type="button" data-edit-todo="${todo.id}" data-value="${html(todo.title)}">${html(todo.title)}</button>
      <button class="complete-button" type="button" data-complete-todo="${todo.id}" aria-label="完成 ${html(todo.title)}">✓</button>
    </div>
  `;
}

function renderPriority(state) {
  const priority = priorityTodo(state);
  const container = byId('priority-content');
  if (!priority) {
    container.innerHTML = '<p class="priority-empty">拖一条 Todo 到这里，明确此刻的下一步。</p>';
    return;
  }
  container.innerHTML = `
    <div class="priority-card" draggable="true" tabindex="0" data-todo-id="${priority.id}" aria-label="当前优先：${html(priority.title)}">
      <div class="priority-copy">
        <button class="priority-title" type="button" data-edit-todo="${priority.id}" data-value="${html(priority.title)}">${html(priority.title)}</button>
        <small>${html(todoSource(state, priority))}</small>
      </div>
      <button class="complete-button" type="button" data-complete-todo="${priority.id}" aria-label="完成 ${html(priority.title)}">✓</button>
    </div>
  `;
}

function renderTodos(state) {
  const current = currentMainline(state);
  const mainlineTodos = current?.todos ?? [];
  byId('mainline-todo-count').textContent = mainlineTodos.length;
  byId('state-todo-count').textContent = state.stateTodos.length;
  byId('mainline-todos').dataset.mainlineId = current?.id ?? '';
  byId('mainline-todos').innerHTML = mainlineTodos.length
    ? mainlineTodos.map(todoRow).join('')
    : `<p class="list-empty">${current ? '这条主线还没有 Todo。' : '先创建或选择一条 Current 主线。'}</p>`;
  byId('state-todos').innerHTML = state.stateTodos.length
    ? state.stateTodos.map(todoRow).join('')
    : '<p class="list-empty">这个状态还没有通用 Todo。</p>';
  byId('mainline-todo-input').disabled = !current;
  byId('mainline-todo-form').querySelector('button').disabled = !current;
  byId('mainline-todo-input').placeholder = current ? '＋ 添加 Todo' : '先选择 Current 主线';
}

function renderDashboard() {
  const state = activeState();
  if (!state) return;
  renderStateControls(state);
  renderMainlineSlots(state);
  renderCurrentDetail(state);
  renderPriority(state);
  renderTodos(state);
}

function formatEndedAt(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function renderHistory() {
  const container = byId('history-list');
  if (!ui.snapshot.history.length) {
    container.innerHTML = '<p class="history-empty">还没有完成或放弃的记录。切换 Current 不会制造历史。</p>';
    return;
  }
  container.innerHTML = ui.snapshot.history.map((item) => {
    const expanded = ui.expandedHistory.has(`${item.type}:${item.id}`);
    const details = item.type === 'mainline' ? `
      <div class="history-details" ${expanded ? '' : 'hidden'}>
        <div><small>一句话目标</small><p>${html(item.goal || '未填写')}</p></div>
        <div><small>完成标准</small><p>${html(item.successCriteria || '未填写')}</p></div>
        <div><small>阶段跨度</small><p>${html(item.horizon || '未填写')}</p></div>
        <div class="history-bound-todos"><small>最终仍绑定的历史 Todo</small>
          ${item.boundTodos.length ? `<ul>${item.boundTodos.map((todo) => `<li>${html(todo.title)} · ${statusLabel(todo.status)}</li>`).join('')}</ul>` : '<p>没有。</p>'}
        </div>
      </div>
    ` : '';
    return `
      <article class="history-item">
        <div class="history-summary">
          <strong>${html(item.name)}</strong>
          <span class="history-meta">${typeLabel(item.type)}</span>
          <span class="history-status">${statusLabel(item.status)}</span>
          <span class="history-meta">${html(stateName(ui.snapshot, item.stateId))}</span>
          <span class="history-meta">${formatEndedAt(item.endedAt)}</span>
          ${item.type === 'mainline' ? `
            <button class="history-toggle" type="button" data-history-toggle="${item.type}:${item.id}">${expanded ? '收起' : '展开'}</button>
            <button class="copy-history" type="button" data-copy-mainline="${item.id}">复制为新主线</button>
          ` : ''}
        </div>
        ${details}
      </article>
    `;
  }).join('');
}

function renderSettings() {
  byId('display-name-input').value = ui.snapshot.settings.displayName;
  document.querySelectorAll('[data-cue-state]').forEach((input) => {
    input.value = stateById(ui.snapshot, input.dataset.cueState)?.cue ?? '';
  });
}

function renderAll() {
  renderChrome();
  renderDashboard();
  navigate(ui.page);
}

function focusStateTab(stateId) {
  byId('route-tabs').querySelector(`[data-state-id="${stateId}"]`)?.focus({ preventScroll: true });
}

async function selectState(stateId, restoreFocus = false) {
  if (!stateById(ui.snapshot, stateId)) return;
  if (stateId === ui.activeStateId) {
    if (restoreFocus) focusStateTab(stateId);
    return;
  }
  ui.activeStateId = stateId;
  ui.createSlot = null;
  renderDashboard();
  if (restoreFocus) focusStateTab(stateId);
  const snapshot = await mutate(() => api.updateAppState(stateId));
  if (snapshot && restoreFocus) focusStateTab(stateId);
}

function beginInlineEdit(button, value, onSave, maxLength) {
  if (button.querySelector('input')) return;
  const input = document.createElement('input');
  input.className = 'inline-editor';
  input.value = value;
  input.maxLength = maxLength;
  button.replaceChildren(input);
  input.focus();
  input.select();
  let settled = false;
  const cancel = () => {
    if (settled) return;
    settled = true;
    renderAll();
  };
  const save = async () => {
    if (settled) return;
    const nextValue = input.value.trim();
    settled = true;
    if (nextValue === value.trim()) {
      renderAll();
      return;
    }
    const result = await onSave(nextValue);
    if (!result) renderAll();
  };
  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); save(); }
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', save, { once: true });
}

function closeContextMenu() {
  byId('context-menu').hidden = true;
}

function openContextMenu(type, id, x, y) {
  const menu = byId('context-menu');
  menu.innerHTML = type === 'mainline'
    ? `
      <button type="button" role="menuitem" data-context-action="complete" data-target-id="${id}">完成主线</button>
      <button type="button" role="menuitem" data-context-action="abandon" data-target-id="${id}">放弃主线</button>
      <button class="danger" type="button" role="menuitem" data-context-action="delete-mainline" data-target-id="${id}">删除主线</button>
    `
    : `
      <button type="button" role="menuitem" data-context-action="abandon-todo" data-target-id="${id}">放弃 Todo</button>
      <button class="danger" type="button" role="menuitem" data-context-action="delete-todo" data-target-id="${id}">删除 Todo</button>
    `;
  menu.hidden = false;
  menu.style.left = `${Math.min(x, window.innerWidth - 175)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 10)}px`;
  menu.querySelector('button')?.focus();
}

function openDialog({ kicker, title, message, fields = '', confirmLabel = '确认', danger = false, onConfirm }) {
  byId('dialog-kicker').textContent = kicker;
  byId('dialog-title').textContent = title;
  byId('dialog-message').textContent = message;
  byId('dialog-fields').innerHTML = fields;
  const confirm = byId('dialog-confirm');
  confirm.textContent = confirmLabel;
  confirm.classList.toggle('danger-action', danger);
  confirm.classList.toggle('primary-action', !danger);
  ui.dialogAction = onConfirm;
  byId('action-dialog').showModal();
  requestAnimationFrame(() => byId('dialog-fields').querySelector('input, select')?.focus());
}

function closeEndPanel() {
  ui.endAction = null;
  byId('end-panel').hidden = true;
}

async function beginEndMainline(mainline, status) {
  if (!mainline.todos.length) {
    await mutate(
      () => api.endMainline(mainline.id, { status, resolutions: {} }),
      status === 'completed' ? '主线已完成' : '主线已放弃',
    );
    return;
  }
  const state = activeState();
  const alternatives = state.mainlines.filter((item) => item.id !== mainline.id);
  ui.endAction = { mainlineId: mainline.id, status };
  byId('end-panel-kicker').textContent = status === 'completed' ? '完成主线' : '放弃主线';
  byId('end-panel-title').textContent = `处理“${mainline.name}”的剩余 Todo`;
  byId('resolution-list').innerHTML = mainline.todos.map((todo) => `
    <label class="resolution-row">
      <strong>${html(todo.title)}</strong>
      <select data-resolution-todo="${todo.id}">
        <option value="abandon">标记为已放弃（默认）</option>
        <option value="state">移到${html(state.name)}通用 Todo</option>
        ${alternatives.map((target) => `<option value="mainline:${target.id}">移到 ${html(target.name)}</option>`).join('')}
      </select>
    </label>
  `).join('');
  byId('end-panel').hidden = false;
}

function confirmDeleteMainline(mainline) {
  const hasTodos = mainline.todos.length > 0;
  openDialog({
    kicker: '不可逆操作',
    title: `删除“${mainline.name}”`,
    message: hasTodos ? '选择这条主线所绑定 Todo 的处理方式。删除后主线无法恢复。' : '这条主线将被永久删除。',
    fields: hasTodos ? `
      <label><span>Todo 处理</span><select name="todoPolicy">
        <option value="move_to_state">移动到${html(activeState().name)}通用 Todo（推荐）</option>
        <option value="delete">连同 Todo 一起永久删除</option>
      </select></label>
    ` : '',
    confirmLabel: '确认删除',
    danger: true,
    onConfirm: async (values) => {
      await mutate(() => api.deleteMainline(mainline.id, values.todoPolicy || 'move_to_state'), '主线已删除');
    },
  });
}

function confirmDeleteTodo(todo) {
  openDialog({
    kicker: '不可逆操作',
    title: `删除“${todo.title}”`,
    message: '这条 Todo 会被永久删除，不会进入历史。',
    confirmLabel: '确认删除',
    danger: true,
    onConfirm: async () => {
      await mutate(() => api.deleteTodo(todo.id), 'Todo 已删除');
    },
  });
}

function clearDragState() {
  ui.drag = null;
  document.body.classList.remove('dragging-todo', 'dragging-mainline');
  document.querySelectorAll('.drop-active, .drag-target').forEach((element) => element.classList.remove('drop-active', 'drag-target'));
}

function todoDropPosition(list, clientY) {
  const rows = [...list.querySelectorAll('.todo-row')]
    .filter((row) => row.dataset.todoId !== ui.drag?.id);
  const beforeIndex = rows.findIndex((row) => clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
  return beforeIndex === -1 ? rows.length + 1 : beforeIndex + 1;
}

function setupNavigation() {
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.page));
  });
  document.querySelector('[data-page-link="dashboard"]').addEventListener('click', (event) => {
    event.preventDefault();
    navigate('dashboard');
  });
  byId('dismiss-error').addEventListener('click', () => { byId('error-banner').hidden = true; });
}

function setupDashboardEvents() {
  byId('route-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-state-id]');
    if (button) selectState(button.dataset.stateId, true);
  });
  byId('route-tabs').addEventListener('keydown', (event) => {
    const button = event.target.closest('[data-state-id]');
    if (!button) return;
    const stateId = stateIdFromNavigationKey(ui.snapshot.states, button.dataset.stateId, event.key);
    if (!stateId) return;
    event.preventDefault();
    selectState(stateId, true);
  });

  byId('mainline-slots').addEventListener('click', async (event) => {
    const empty = event.target.closest('[data-empty-slot]');
    if (empty) {
      ui.createSlot = Number(empty.dataset.emptySlot);
      renderMainlineSlots(activeState());
      return;
    }
    const menuButton = event.target.closest('[data-mainline-menu]');
    if (menuButton) {
      event.stopPropagation();
      const rect = menuButton.getBoundingClientRect();
      openContextMenu('mainline', menuButton.dataset.mainlineMenu, rect.right - 150, rect.bottom + 4);
      return;
    }
    const card = event.target.closest('[data-mainline-id]');
    if (card && card.dataset.mainlineId !== activeState().currentMainlineId) {
      await mutate(() => api.setCurrentMainline(card.dataset.mainlineId), 'Current 主线已切换');
    }
  });

  byId('mainline-slots').addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-create-slot]');
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector('input');
    const name = input.value.trim();
    if (!name) return;
    const slotIndex = Number(form.dataset.createSlot);
    const snapshot = await mutate(() => api.createMainline({ stateId: activeState().id, slotIndex, name }), '主线已创建');
    if (snapshot) {
      ui.createSlot = null;
      renderDashboard();
    }
  });

  byId('mainline-slots').addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-mainline-id]');
    if (!card) return;
    if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
      event.preventDefault();
      mutate(() => api.setCurrentMainline(card.dataset.mainlineId), 'Current 主线已切换');
    }
    if (event.shiftKey && event.key === 'F10') {
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      openContextMenu('mainline', card.dataset.mainlineId, rect.left + 20, rect.top + 20);
    }
  });

  byId('mainline-slots').addEventListener('contextmenu', (event) => {
    const card = event.target.closest('[data-mainline-id]');
    if (!card) return;
    event.preventDefault();
    openContextMenu('mainline', card.dataset.mainlineId, event.clientX, event.clientY);
  });

  byId('current-detail').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-mainline]');
    if (!button) return;
    const field = button.dataset.field;
    const value = button.dataset.value;
    beginInlineEdit(
      button,
      value,
      (nextValue) => mutate(() => api.updateMainline(button.dataset.editMainline, { [field]: nextValue }), '主线已更新'),
      field === 'name' ? 60 : field === 'horizon' ? 40 : field === 'goal' ? 180 : 240,
    );
  });

  byId('mainline-todo-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = currentMainline(activeState());
    const input = byId('mainline-todo-input');
    const title = input.value.trim();
    if (!current || !title) return;
    const snapshot = await mutate(() => api.createTodo({ stateId: activeState().id, mainlineId: current.id, title }), 'Todo 已添加');
    if (snapshot) input.value = '';
  });
  byId('state-todo-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = byId('state-todo-input');
    const title = input.value.trim();
    if (!title) return;
    const snapshot = await mutate(() => api.createTodo({ stateId: activeState().id, title }), 'Todo 已添加');
    if (snapshot) input.value = '';
  });

  [byId('priority-content'), byId('mainline-todos'), byId('state-todos')].forEach((container) => {
    container.addEventListener('click', (event) => {
      const complete = event.target.closest('[data-complete-todo]');
      if (complete) {
        mutate(() => api.completeTodo(complete.dataset.completeTodo), 'Todo 已完成，下一步已接棒');
        return;
      }
      const edit = event.target.closest('[data-edit-todo]');
      if (edit) {
        beginInlineEdit(
          edit,
          edit.dataset.value,
          (title) => mutate(() => api.updateTodo(edit.dataset.editTodo, { title }), 'Todo 已更新'),
          160,
        );
      }
    });
    container.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('[data-todo-id]');
      if (!row) return;
      event.preventDefault();
      openContextMenu('todo', row.dataset.todoId, event.clientX, event.clientY);
    });
    container.addEventListener('keydown', (event) => {
      const row = event.target.closest('[data-todo-id]');
      if (row && event.shiftKey && event.key === 'F10') {
        event.preventDefault();
        const rect = row.getBoundingClientRect();
        openContextMenu('todo', row.dataset.todoId, rect.left + 20, rect.top + 20);
      }
    });
  });
}

function setupContextMenu() {
  byId('context-menu').addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-context-action]');
    if (!actionButton) return;
    const { contextAction: action, targetId: id } = actionButton.dataset;
    closeContextMenu();
    if (action === 'complete' || action === 'abandon') {
      const mainline = mainlineById(id);
      if (mainline) await beginEndMainline(mainline, action === 'complete' ? 'completed' : 'abandoned');
    } else if (action === 'delete-mainline') {
      const mainline = mainlineById(id);
      if (mainline) confirmDeleteMainline(mainline);
    } else if (action === 'abandon-todo') {
      await mutate(() => api.abandonTodo(id), 'Todo 已放弃');
    } else if (action === 'delete-todo') {
      const todo = todoById(id);
      if (todo) confirmDeleteTodo(todo);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#context-menu') && !event.target.closest('[data-mainline-menu]')) closeContextMenu();
  });
  window.addEventListener('blur', closeContextMenu);
}

function setupDragAndDrop() {
  document.addEventListener('dragstart', (event) => {
    const todo = event.target.closest('[data-todo-id]');
    const mainline = event.target.closest('[data-mainline-id]');
    if (todo) {
      ui.drag = { type: 'todo', id: todo.dataset.todoId };
      document.body.classList.add('dragging-todo');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', todo.dataset.todoId);
    } else if (mainline) {
      ui.drag = { type: 'mainline', id: mainline.dataset.mainlineId };
      document.body.classList.add('dragging-mainline');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', mainline.dataset.mainlineId);
    }
  });

  document.addEventListener('dragover', (event) => {
    if (!ui.drag) return;
    const target = ui.drag.type === 'todo'
      ? event.target.closest('#priority-zone, .todo-list, .mainline-card')
      : event.target.closest('.mainline-slot');
    if (!target) return;
    event.preventDefault();
    document.querySelectorAll('.drop-active, .drag-target').forEach((element) => element.classList.remove('drop-active', 'drag-target'));
    target.classList.add(target.classList.contains('mainline-card') ? 'drag-target' : 'drop-active');
  });

  document.addEventListener('drop', async (event) => {
    if (!ui.drag) return;
    const drag = { ...ui.drag };
    if (drag.type === 'mainline') {
      const slot = event.target.closest('.mainline-slot');
      if (!slot) return;
      event.preventDefault();
      clearDragState();
      await mutate(() => api.moveMainline(drag.id, Number(slot.dataset.slotIndex)), '主线槽位已保存');
      return;
    }

    const priority = event.target.closest('#priority-zone');
    const card = event.target.closest('.mainline-card');
    const list = event.target.closest('.todo-list');
    if (!priority && !card && !list) return;
    event.preventDefault();
    clearDragState();
    if (priority) {
      await mutate(() => api.setPriority(drag.id), '当前优先已更新');
    } else if (card) {
      const target = mainlineById(card.dataset.mainlineId);
      await mutate(() => api.moveTodo(drag.id, { mainlineId: target.id, position: target.todos.length + 1 }), 'Todo 归属已更新');
    } else if (list) {
      const targetMainlineId = list.dataset.todoScope === 'mainline' ? list.dataset.mainlineId || null : null;
      await mutate(() => api.moveTodo(drag.id, {
        mainlineId: targetMainlineId,
        position: todoDropPosition(list, event.clientY),
      }), 'Todo 顺序已保存');
    }
  });
  document.addEventListener('dragend', clearDragState);
}

function setupEndPanel() {
  byId('close-end-panel').addEventListener('click', closeEndPanel);
  byId('cancel-end-panel').addEventListener('click', closeEndPanel);
  byId('end-mainline-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ui.endAction) return;
    const resolutions = {};
    document.querySelectorAll('[data-resolution-todo]').forEach((select) => {
      const value = select.value;
      resolutions[select.dataset.resolutionTodo] = value.startsWith('mainline:')
        ? { target: 'mainline', mainlineId: value.slice('mainline:'.length) }
        : { target: value };
    });
    const { mainlineId, status } = ui.endAction;
    closeEndPanel();
    await mutate(
      () => api.endMainline(mainlineId, { status, resolutions }),
      status === 'completed' ? '主线已完成' : '主线已放弃',
    );
  });
}

function setupDialog() {
  byId('action-dialog-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') {
      ui.dialogAction = null;
      byId('action-dialog').close();
      return;
    }
    if (!ui.dialogAction) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const action = ui.dialogAction;
    ui.dialogAction = null;
    byId('action-dialog').close();
    await action(values);
  });
  byId('action-dialog').addEventListener('close', () => { ui.dialogAction = null; });
}

function setupHistory() {
  byId('history-list').addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-history-toggle]');
    if (toggle) {
      const key = toggle.dataset.historyToggle;
      if (ui.expandedHistory.has(key)) ui.expandedHistory.delete(key);
      else ui.expandedHistory.add(key);
      renderHistory();
      return;
    }
    const copy = event.target.closest('[data-copy-mainline]');
    if (copy) {
      const item = ui.snapshot.history.find((historyItem) => historyItem.type === 'mainline' && historyItem.id === copy.dataset.copyMainline);
      openDialog({
        kicker: '从历史重新出发',
        title: '复制为新的独立主线',
        message: '新主线会获得新 ID，并预填目标、完成标准和阶段跨度；不会复制旧 Todo。',
        fields: `<label><span>新的全局唯一名称</span><input name="name" maxlength="60" required value="${html(item.name)} · 新阶段" /></label>`,
        confirmLabel: '创建新主线',
        onConfirm: async ({ name }) => {
          const snapshot = await mutate(() => api.copyMainline(item.id, name), '新主线已创建');
          if (snapshot) {
            ui.activeStateId = item.stateId;
            navigate('dashboard');
          }
        },
      });
    }
  });
}

function setupSettings() {
  byId('display-name-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await mutate(() => api.updateSettings({ displayName: byId('display-name-input').value }), '显示名称已保存');
  });
  byId('avatar-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = byId('avatar-input').files[0];
    if (!file) {
      showError('没有选择头像', new Error('请选择 PNG、JPEG 或 WebP 图片。'));
      return;
    }
    await mutate(() => api.uploadAvatar(file), '本地头像已更新');
    byId('avatar-input').value = '';
  });
  byId('cue-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      let snapshot = ui.snapshot;
      for (const input of document.querySelectorAll('[data-cue-state]')) {
        snapshot = await api.updateState(input.dataset.cueState, { cue: input.value });
      }
      applySnapshot(snapshot);
      showToast('三个状态 Cue 已保存');
    } catch (error) {
      showError('Cue 没有保存完整', error);
    } finally {
      setBusy(false);
    }
  });
  byId('restore-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const file = byId('restore-input').files[0];
    if (!file) {
      showError('没有选择数据库', new Error('请选择 SUOWANG 的 SQLite 备份文件。'));
      return;
    }
    openDialog({
      kicker: '整库覆盖恢复',
      title: '用这个备份覆盖当前数据库？',
      message: 'SUOWANG 会先自动备份当前数据库，再执行覆盖恢复。两个数据库不会合并。',
      confirmLabel: '备份当前数据并恢复',
      danger: true,
      onConfirm: async () => {
        const snapshot = await mutate(() => api.restoreDatabase(file), '数据库已恢复');
        if (snapshot) {
          ui.activeStateId = snapshot.settings.lastViewedStateId;
          navigate('dashboard');
        }
        byId('restore-input').value = '';
      },
    });
  });
}

function setup() {
  setupNavigation();
  setupDashboardEvents();
  setupContextMenu();
  setupDragAndDrop();
  setupEndPanel();
  setupDialog();
  setupHistory();
  setupSettings();
}

async function initialize() {
  setup();
  try {
    const snapshot = await api.snapshot();
    ui.activeStateId = snapshot.settings.lastViewedStateId;
    applySnapshot(snapshot);
    byId('loading-layer').classList.add('done');
  } catch (error) {
    byId('loading-layer').classList.add('done');
    showError('本地驾驶舱没有连接成功', error);
  }
}

initialize();
