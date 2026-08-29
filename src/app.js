import { api } from './api.js';
import {
  currentMainline,
  daylightEmojiForHour,
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
  stuckOpen: false,
  stuckView: 'menu',
  departureTodoId: null,
  expandedHistory: new Set(),
};
const desktop = globalThis.suowangDesktop ?? null;

const byId = (id) => document.getElementById(id);
const html = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function modeIcon(stateId) {
  if (stateId === 'restore') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 4.6C12.2 4.7 7.1 7.5 5.7 13.1c-.6 2.5.3 4.6 2.1 5.9 4.4-.8 7.8-3.4 9.6-7.6 1.1-2.5 1.6-4.8 2-6.8Z"/><path d="M4.6 20.2c2.4-4.5 5.9-7.6 10.7-9.6"/></svg>';
  }
  if (stateId === 'work') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v1.7M3.5 12h17M10 12v1.5h4V12"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4.5l8.5 6.7V20h-17Z"/><path d="M9 20v-5.5h6V20"/></svg>';
}

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
  document.documentElement.dataset.workspaceDensity = snapshot.settings.workspaceDensity;
  ui.stuckOpen = false;
  ui.stuckView = 'menu';
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
  byId('daylight-icon').textContent = daylightEmojiForHour(now.getHours());
  byId('greeting').textContent = `${greetingForHour(now.getHours())}，${settings.displayName}`;
  byId('local-date').textContent = formatLocalDate(now);
  byId('profile-name').textContent = settings.displayName;
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
      aria-label="${selected ? `${html(item.name)}，当前模式` : `切换到${html(item.name)}模式`}">
      <span class="route-tab-label">
        <span class="route-tab-icon">${modeIcon(item.id)}</span>
        <strong>${html(item.name)}模式</strong>
      </span>
    </button>
  `;
  }).join('');
  byId('road-stage').dataset.activeState = state.id;
  document.querySelectorAll('[data-road-scene]').forEach((layer) => {
    layer.classList.toggle('selected', layer.dataset.roadScene === state.id);
  });
  byId('state-cue').textContent = `${state.name}模式 · ${state.cue || '暂未设置提示语'}`;
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
            ${mainline.id === state.currentMainlineId ? '<span class="mainline-state">当前主线</span>' : ''}
            <span class="mainline-name">${html(mainline.name)}</span>
            <span class="mainline-goal">${html(mainline.goal || '添加主线目标')}</span>
            <button class="mainline-more" type="button" data-mainline-menu="${mainline.id}" aria-label="${html(mainline.name)}的更多操作">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.65"/><circle cx="12" cy="12" r="1.65"/><circle cx="18" cy="12" r="1.65"/></svg>
            </button>
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
    container.innerHTML = '<p class="detail-empty">创建一条主线，它会自动成为当前主线。</p>';
    return;
  }
  const fields = [
    ['name', '主线名称', current.name, '输入主线名称'],
    ['goal', '主线目标', current.goal, '添加主线目标'],
    ['successCriteria', '本阶段完成标准', current.successCriteria, '添加本阶段完成标准'],
    ['horizon', '本阶段时间范围', current.horizon, '添加本阶段时间范围'],
  ];
  container.innerHTML = fields.map(([field, label, value, placeholder]) => `
    <button class="detail-field" type="button" data-edit-mainline="${current.id}" data-field="${field}" data-value="${html(value)}">
      <small>${label}</small>
      <span class="${value ? '' : 'placeholder'}">${html(value || placeholder)}</span>
    </button>
  `).join('');
}

function todoRow(todo) {
  const ongoing = todo.kind === 'ongoing';
  const ongoingDescription = `持续事项，累计 ${todo.completionCount} 次`;
  const minimalStep = todo.minimalStep ? `
    <span class="todo-separator" aria-hidden="true">｜</span>
    <button class="todo-minimal-step" type="button" data-edit-todo="${todo.id}" data-field="minimalStep" data-value="${html(todo.minimalStep)}">${html(todo.minimalStep)}</button>
  ` : `
    <button class="todo-minimal-step todo-minimal-step-empty" type="button" data-edit-todo="${todo.id}" data-field="minimalStep" data-value="" aria-label="为${html(todo.title)}添加最小一步">＋ 最小一步</button>
  `;
  return `
    <div class="todo-row ${ongoing ? 'todo-row-ongoing' : ''}" draggable="true" tabindex="0" data-todo-id="${todo.id}" aria-label="${ongoing ? `${ongoingDescription}，` : '事项：'}${html(todo.title)}${todo.minimalStep ? `，最小一步：${html(todo.minimalStep)}` : ''}${ongoing && todo.completedToday ? '，今天已完成' : ''}">
      <div class="todo-copy ${todo.minimalStep ? 'has-minimal-step' : ''}">
        <button class="todo-title" type="button" data-edit-todo="${todo.id}" data-field="title" data-value="${html(todo.title)}">${html(todo.title)}</button>
        ${minimalStep}
      </div>
      <div class="todo-actions">
        ${ongoing ? `<span class="todo-ongoing-count" title="${ongoingDescription}" aria-label="${ongoingDescription}">↻ ${todo.completionCount}</span>` : ''}
        <button class="complete-button ${ongoing ? 'ongoing-complete' : ''} ${todo.completedToday ? 'is-completed-today' : ''}" type="button" ${ongoing ? `data-record-todo="${todo.id}"` : `data-complete-todo="${todo.id}"`} ${todo.completedToday ? 'disabled' : ''} aria-label="${ongoing ? (todo.completedToday ? `今天已完成，累计 ${todo.completionCount} 次` : `记录今天完成 ${html(todo.title)}`) : `完成 ${html(todo.title)}`}">✓</button>
      </div>
    </div>
  `;
}

function orderedActiveTodos(state) {
  const current = currentMainline(state);
  return [
    ...(current?.todos ?? []),
    ...state.mainlines.filter((mainline) => mainline.id !== current?.id).flatMap((mainline) => mainline.todos),
    ...state.stateTodos,
  ];
}

function renderStuckPanel(state, priority) {
  if (ui.stuckView === 'todo') {
    const alternatives = orderedActiveTodos(state).filter((todo) => todo.id !== priority.id);
    return `
      <section class="stuck-panel stuck-picker" id="stuck-panel" aria-label="换一件事">
        <header class="stuck-panel-heading">
          <button class="stuck-back" type="button" data-stuck-back aria-label="返回调整方式">←</button>
          <strong>换一件事</strong>
        </header>
        <div class="stuck-pick-list">
          ${alternatives.length ? alternatives.map((todo) => `
            <button type="button" data-stuck-select-todo="${todo.id}">
              <strong>${html(todo.title)}</strong>
              <small>${html(todoSource(state, todo))}</small>
            </button>
          `).join('') : '<p>这个模式暂时没有其他可选事项。</p>'}
        </div>
      </section>
    `;
  }

  if (ui.stuckView === 'mainline') {
    return `
      <section class="stuck-panel stuck-picker" id="stuck-panel" aria-label="看看主线">
        <header class="stuck-panel-heading">
          <button class="stuck-back" type="button" data-stuck-back aria-label="返回调整方式">←</button>
          <strong>看看主线</strong>
        </header>
        <div class="stuck-pick-list">
          ${state.mainlines.length ? state.mainlines.map((mainline) => `
            <button type="button" data-stuck-select-mainline="${mainline.id}">
              <strong>${html(mainline.name)}</strong>
              <small>${mainline.id === state.currentMainlineId ? '当前主线' : html(mainline.goal || '设为当前主线')}</small>
            </button>
          `).join('') : '<p>这个模式还没有主线。</p>'}
        </div>
      </section>
    `;
  }

  return `
    <section class="stuck-panel" id="stuck-panel" aria-label="走不动时的调整方式">
      <header class="stuck-panel-heading">
        <strong>走不动时，可以换一种走法</strong>
      </header>
      <div class="stuck-options">
        <button type="button" data-stuck-action="minimal-step">
          <small>步幅</small><strong>再小一点</strong><span>把「最小一步」改得更容易开始</span>
        </button>
        <button type="button" data-stuck-action="todo">
          <small>动作</small><strong>换一件事</strong><span>暂时换一个事项作为下一步</span>
        </button>
        <button type="button" data-stuck-action="mainline">
          <small>方向</small><strong>看看主线</strong><span>也许现在真正该推进的不是这件事</span>
        </button>
        <button type="button" data-stuck-action="restore">
          <small>模式</small><strong>先去恢复</strong><span>切换到恢复模式，养精蓄锐再来干</span>
        </button>
      </div>
    </section>
  `;
}

function renderPriority(state) {
  const priority = priorityTodo(state);
  const container = byId('priority-content');
  const stuckToggle = byId('stuck-toggle');
  byId('priority-zone').classList.toggle('stuck-open', Boolean(priority && ui.stuckOpen));
  stuckToggle.hidden = !priority;
  stuckToggle.textContent = ui.stuckOpen ? '收起' : '卡住了？';
  stuckToggle.setAttribute('aria-expanded', String(Boolean(priority && ui.stuckOpen)));
  if (!priority) {
    container.innerHTML = '<p class="priority-empty">拖一条事项到这里，明确此刻的下一步。</p>';
    return;
  }
  if (ui.stuckOpen) {
    container.innerHTML = renderStuckPanel(state, priority);
    return;
  }
  const started = state.startedTodoId === priority.id;
  const departing = ui.departureTodoId === priority.id;
  const completionLabel = priority.kind === 'ongoing' ? '今天完成' : '完成这一步';
  const completionAriaLabel = priority.kind === 'ongoing'
    ? `记录今天完成 ${html(priority.title)}`
    : `完成 ${html(priority.title)}`;
  container.innerHTML = `
    <div class="priority-card ${started ? 'is-started' : ''} ${departing ? 'is-departing' : ''}" tabindex="0" data-todo-id="${priority.id}" aria-label="${started ? '正在走：' : '下一步：'}${html(priority.title)}">
      <div class="priority-copy">
        ${started ? '<p class="priority-journey-state">正在走这一步</p>' : ''}
        <button class="priority-title" type="button" data-edit-todo="${priority.id}" data-field="title" data-value="${html(priority.title)}">${html(priority.title)}</button>
        <button class="priority-minimal-step ${priority.minimalStep ? '' : 'is-empty'}" type="button" data-edit-todo="${priority.id}" data-field="minimalStep" data-value="${html(priority.minimalStep)}">
          ${priority.minimalStep ? `<span>最小一步：</span>${html(priority.minimalStep)}` : '＋ 添加最小一步'}
        </button>
      </div>
      <div class="priority-footer">
        ${priority.kind === 'ongoing' ? `<span class="priority-ongoing-count" title="持续事项，累计 ${priority.completionCount} 次" aria-label="持续事项，累计 ${priority.completionCount} 次">↻ ${priority.completionCount}</span>` : ''}
        ${started
          ? `<div class="priority-running-actions">
              <button class="priority-pause" type="button" data-pause-todo="${priority.id}" aria-label="暂停 ${html(priority.title)}">
                <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M7 5.5v9M13 5.5v9"/></svg>
                <span>暂停</span>
              </button>
              <button class="complete-button priority-complete" type="button" ${priority.kind === 'ongoing' ? `data-record-todo="${priority.id}"` : `data-complete-todo="${priority.id}"`} aria-label="${completionAriaLabel}">
                <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 10.3 3.1 3.1L15.3 6"/></svg>
                <span>${completionLabel}</span>
              </button>
            </div>`
          : `<button class="priority-start" type="button" data-start-todo="${priority.id}" aria-label="开始 ${html(priority.title)}">
              <span>开始这一步</span>
              <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4.5 10h10.2M11 6.3l3.7 3.7-3.7 3.7"/></svg>
            </button>`}
      </div>
    </div>
  `;
}

function renderTodos(state) {
  const current = currentMainline(state);
  const mainlineTodos = current?.todos ?? [];
  byId('mainline-todo-heading').textContent = '主线事项';
  byId('mainline-todo-count').textContent = mainlineTodos.length;
  byId('state-todo-count').textContent = state.stateTodos.length;
  byId('mainline-todos').dataset.mainlineId = current?.id ?? '';
  byId('mainline-todos').innerHTML = mainlineTodos.length
    ? mainlineTodos.map(todoRow).join('')
    : `<p class="list-empty">${current ? '这条主线还没有事项。' : '先创建或选择一条当前主线。'}</p>`;
  byId('state-todos').innerHTML = state.stateTodos.length
    ? state.stateTodos.map(todoRow).join('')
    : '<p class="list-empty">这个模式还没有其他事项。</p>';
  byId('mainline-todo-input').disabled = !current;
  byId('mainline-todo-form').querySelector('button[type="submit"]').disabled = !current;
  byId('mainline-todo-input').placeholder = current ? '＋ 添加事项' : '先选择当前主线';
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
    container.innerHTML = '<p class="history-empty">还没有完成或放弃的行迹。切换当前主线不会制造行迹。</p>';
    return;
  }
  container.innerHTML = ui.snapshot.history.map((item) => {
    const expanded = ui.expandedHistory.has(`${item.type}:${item.id}`);
    const details = item.type === 'mainline' ? `
      <div class="history-details" ${expanded ? '' : 'hidden'}>
        <div><small>主线目标</small><p>${html(item.goal || '未填写')}</p></div>
        <div><small>本阶段完成标准</small><p>${html(item.successCriteria || '未填写')}</p></div>
        <div><small>本阶段时间范围</small><p>${html(item.horizon || '未填写')}</p></div>
        <div class="history-bound-todos"><small>最终仍绑定的事项</small>
          ${item.boundTodos.length ? `<ul>${item.boundTodos.map((todo) => `<li>${html(todo.title)}${todo.minimalStep ? ` ｜ ${html(todo.minimalStep)}` : ''} · ${statusLabel(todo.status)}</li>`).join('')}</ul>` : '<p>没有。</p>'}
        </div>
      </div>
    ` : '';
    return `
      <article class="history-item history-item-${item.type}">
        <div class="history-summary">
          <strong>${html(item.name)}${item.type === 'todo' && item.kind === 'ongoing' ? `<small class="history-ongoing-count">持续 · 累计 ${item.completionCount} 次</small>` : ''}${item.type === 'todo' && item.minimalStep ? `<small class="history-minimal-step"> ｜ ${html(item.minimalStep)}</small>` : ''}</strong>
          <span class="history-meta">${typeLabel(item.type)}</span>
          <span class="history-status">${statusLabel(item.status)}</span>
          <span class="history-meta">${html(stateName(ui.snapshot, item.stateId))}</span>
          <span class="history-meta">${formatEndedAt(item.endedAt)}</span>
          <div class="history-actions">
            ${item.type === 'mainline' ? `
              <button class="history-toggle" type="button" data-history-toggle="${item.type}:${item.id}">${expanded ? '收起' : '展开'}</button>
              <button class="copy-history" type="button" data-copy-mainline="${item.id}">复制为新主线</button>
            ` : `<button class="undo-history" type="button" data-reopen-todo="${item.id}" aria-label="撤回事项：${html(item.name)}">撤回</button>`}
          </div>
        </div>
        ${details}
      </article>
    `;
  }).join('');
}

function renderSettings() {
  byId('display-name-input').value = ui.snapshot.settings.displayName;
  const densityInput = document.querySelector(`[name="workspace-density"][value="${ui.snapshot.settings.workspaceDensity}"]`);
  if (densityInput) densityInput.checked = true;
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
  ui.stuckOpen = false;
  ui.stuckView = 'menu';
  if (stateId === ui.activeStateId) {
    renderPriority(activeState());
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
  button.classList.add('editing');
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

function beginTodoEdit(button) {
  if (!button) return;
  beginInlineEdit(
    button,
    button.dataset.value,
    (value) => mutate(
      () => api.updateTodo(button.dataset.editTodo, { [button.dataset.field || 'title']: value }),
      button.dataset.field === 'minimalStep' ? '最小一步已更新' : '事项已更新',
    ),
    160,
  );
}

function closeContextMenu() {
  byId('context-menu').hidden = true;
}

function openContextMenu(type, id, x, y) {
  const menu = byId('context-menu');
  const todo = type === 'todo' ? todoById(id) : null;
  menu.innerHTML = type === 'mainline'
    ? `
      <button type="button" role="menuitem" data-context-action="complete" data-target-id="${id}">完成主线</button>
      <button type="button" role="menuitem" data-context-action="abandon" data-target-id="${id}">放弃主线</button>
      <button class="danger" type="button" role="menuitem" data-context-action="delete-mainline" data-target-id="${id}">删除主线</button>
    `
    : todo?.kind === 'ongoing' ? `
      ${todo.completedToday ? `<button type="button" role="menuitem" data-context-action="undo-record" data-target-id="${id}">撤回今天</button>` : ''}
      <button type="button" role="menuitem" data-context-action="complete-todo" data-target-id="${id}">完成事项</button>
      <button type="button" role="menuitem" data-context-action="abandon-todo" data-target-id="${id}">放弃事项</button>
      <button class="danger" type="button" role="menuitem" data-context-action="delete-todo" data-target-id="${id}">删除事项</button>
    ` : `
      <button type="button" role="menuitem" data-context-action="make-ongoing" data-target-id="${id}">设为持续事项</button>
      <button type="button" role="menuitem" data-context-action="complete-todo" data-target-id="${id}">完成事项</button>
      <button type="button" role="menuitem" data-context-action="abandon-todo" data-target-id="${id}">放弃事项</button>
      <button class="danger" type="button" role="menuitem" data-context-action="delete-todo" data-target-id="${id}">删除事项</button>
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
  byId('end-panel-title').textContent = `处理“${mainline.name}”的剩余事项`;
  byId('resolution-list').innerHTML = mainline.todos.map((todo) => `
    <label class="resolution-row">
      <strong>${html(todo.title)}</strong>
      <select data-resolution-todo="${todo.id}">
        <option value="abandon">标记为已放弃（默认）</option>
        <option value="state">移到${html(state.name)}模式的其他事项</option>
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
    message: hasTodos ? '选择这条主线所绑定事项的处理方式。删除后主线无法恢复。' : '这条主线将被永久删除。',
    fields: hasTodos ? `
      <label><span>事项处理</span><select name="todoPolicy">
        <option value="move_to_state">移动到${html(activeState().name)}模式的其他事项（推荐）</option>
        <option value="delete">连同事项一起永久删除</option>
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
    message: '这条事项会被永久删除，不会进入行迹。',
    confirmLabel: '确认删除',
    danger: true,
    onConfirm: async () => {
      await mutate(() => api.deleteTodo(todo.id), '事项已删除');
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
  byId('stuck-toggle').addEventListener('click', () => {
    ui.stuckOpen = !ui.stuckOpen;
    ui.stuckView = 'menu';
    renderPriority(activeState());
  });

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
      await mutate(() => api.setCurrentMainline(card.dataset.mainlineId), '当前主线已切换');
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
      mutate(() => api.setCurrentMainline(card.dataset.mainlineId), '当前主线已切换');
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
    const toggle = event.currentTarget.querySelector('.todo-kind-toggle');
    const kind = toggle.getAttribute('aria-pressed') === 'true' ? 'ongoing' : 'single';
    const snapshot = await mutate(() => api.createTodo({ stateId: activeState().id, mainlineId: current.id, title, kind }), kind === 'ongoing' ? '持续事项已添加' : '事项已添加');
    if (snapshot) { input.value = ''; toggle.setAttribute('aria-pressed', 'false'); }
  });
  byId('state-todo-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = byId('state-todo-input');
    const title = input.value.trim();
    if (!title) return;
    const toggle = event.currentTarget.querySelector('.todo-kind-toggle');
    const kind = toggle.getAttribute('aria-pressed') === 'true' ? 'ongoing' : 'single';
    const snapshot = await mutate(() => api.createTodo({ stateId: activeState().id, title, kind }), kind === 'ongoing' ? '持续事项已添加' : '事项已添加');
    if (snapshot) { input.value = ''; toggle.setAttribute('aria-pressed', 'false'); }
  });
  document.querySelectorAll('.todo-kind-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const pressed = toggle.getAttribute('aria-pressed') === 'true';
      toggle.setAttribute('aria-pressed', String(!pressed));
    });
  });

  [byId('priority-content'), byId('mainline-todos'), byId('state-todos')].forEach((container) => {
    container.addEventListener('click', async (event) => {
      if (event.target.closest('[data-stuck-back]')) {
        ui.stuckView = 'menu';
        renderPriority(activeState());
        return;
      }
      const stuckAction = event.target.closest('[data-stuck-action]')?.dataset.stuckAction;
      if (stuckAction === 'minimal-step') {
        const priority = priorityTodo(activeState());
        ui.stuckOpen = false;
        ui.stuckView = 'menu';
        renderPriority(activeState());
        beginTodoEdit(container.querySelector(`[data-edit-todo="${priority.id}"][data-field="minimalStep"]`));
        return;
      }
      if (stuckAction === 'todo' || stuckAction === 'mainline') {
        ui.stuckView = stuckAction;
        renderPriority(activeState());
        return;
      }
      if (stuckAction === 'restore') {
        const alreadyRestoring = ui.activeStateId === 'restore';
        await selectState('restore', true);
        showToast(alreadyRestoring ? '已经在恢复模式' : '已切换到恢复模式');
        return;
      }
      const selectedTodo = event.target.closest('[data-stuck-select-todo]');
      if (selectedTodo) {
        ui.stuckOpen = false;
        ui.stuckView = 'menu';
        await mutate(() => api.setPriority(selectedTodo.dataset.stuckSelectTodo), '下一步已更新');
        return;
      }
      const selectedMainline = event.target.closest('[data-stuck-select-mainline]');
      if (selectedMainline) {
        ui.stuckOpen = false;
        ui.stuckView = 'menu';
        const mainlineId = selectedMainline.dataset.stuckSelectMainline;
        if (mainlineId === activeState().currentMainlineId) renderPriority(activeState());
        else await mutate(() => api.setCurrentMainline(mainlineId), '当前主线已切换');
        document.querySelector(`[data-mainline-id="${mainlineId}"]`)?.focus({ preventScroll: true });
        return;
      }
      const complete = event.target.closest('[data-complete-todo]');
      if (complete) {
        mutate(() => api.completeTodo(complete.dataset.completeTodo), '事项已完成，下一步已接棒');
        return;
      }
      const record = event.target.closest('[data-record-todo]');
      if (record) {
        mutate(() => api.recordTodo(record.dataset.recordTodo), '今天已完成一次');
        return;
      }
      const start = event.target.closest('[data-start-todo]');
      if (start) {
        const id = start.dataset.startTodo;
        ui.departureTodoId = id;
        const snapshot = await mutate(() => api.startPriority(id), '已出发，先迈出这一小步');
        if (!snapshot) {
          ui.departureTodoId = null;
          return;
        }
        window.setTimeout(() => {
          if (ui.departureTodoId !== id) return;
          ui.departureTodoId = null;
          renderPriority(activeState());
        }, 900);
        return;
      }
      const pause = event.target.closest('[data-pause-todo]');
      if (pause) {
        ui.departureTodoId = null;
        await mutate(() => api.pausePriority(pause.dataset.pauseTodo), '已暂停，事项仍留在下一步');
        return;
      }
      const edit = event.target.closest('[data-edit-todo]');
      if (edit) {
        beginTodoEdit(edit);
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
      await mutate(() => api.abandonTodo(id), '事项已放弃');
    } else if (action === 'make-ongoing') {
      await mutate(() => api.updateTodo(id, { kind: 'ongoing' }), '已设为持续事项');
    } else if (action === 'undo-record') {
      await mutate(() => api.undoTodoRecord(id), '今天的完成记录已撤回');
    } else if (action === 'complete-todo') {
      await mutate(() => api.completeTodo(id), '事项已完成并进入行迹');
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
      await mutate(() => api.setPriority(drag.id), '下一步已更新');
    } else if (card) {
      const target = mainlineById(card.dataset.mainlineId);
      await mutate(() => api.moveTodo(drag.id, { mainlineId: target.id, position: target.todos.length + 1 }), '事项归属已更新');
    } else if (list) {
      const targetMainlineId = list.dataset.todoScope === 'mainline' ? list.dataset.mainlineId || null : null;
      await mutate(() => api.moveTodo(drag.id, {
        mainlineId: targetMainlineId,
        position: todoDropPosition(list, event.clientY),
      }), '事项顺序已保存');
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
        kicker: '从行迹重新出发',
        title: '复制为新的独立主线',
        message: '新主线会获得新 ID，并预填主线目标、本阶段完成标准和本阶段时间范围；不会复制旧事项。',
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
      return;
    }
    const reopen = event.target.closest('[data-reopen-todo]');
    if (reopen) {
      mutate(() => api.reopenTodo(reopen.dataset.reopenTodo), '事项已撤回并回到进行中');
    }
  });
}

function setupSettings() {
  byId('display-name-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await mutate(() => api.updateSettings({ displayName: byId('display-name-input').value }), '显示名称已保存');
  });
  byId('workspace-density-form').addEventListener('change', async (event) => {
    const input = event.target.closest('[name="workspace-density"]');
    if (!input?.checked) return;
    const labels = { small: '小', medium: '中', large: '大', max: '最大' };
    await mutate(() => api.updateSettings({ workspaceDensity: input.value }), `工作区空间已切换为${labels[input.value]}`);
  });
  byId('avatar-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (desktop) {
      setBusy(true);
      try {
        const result = await desktop.chooseAvatar();
        if (result.status === 'saved') {
          applySnapshot(result.snapshot);
          showToast('本地头像已更新');
        }
      } catch (error) {
        showError('头像没有更新', error);
      } finally {
        setBusy(false);
      }
      return;
    }
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
      showToast('三个模式 Cue 已保存');
    } catch (error) {
      showError('Cue 没有保存完整', error);
    } finally {
      setBusy(false);
    }
  });
  byId('restore-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (desktop) {
      setBusy(true);
      desktop.restoreDatabase().then((result) => {
        if (result.status === 'restored') {
          ui.activeStateId = result.snapshot.settings.lastViewedStateId;
          applySnapshot(result.snapshot);
          navigate('dashboard');
          showToast('数据库已恢复');
        }
      }).catch((error) => showError('数据库没有恢复', error)).finally(() => setBusy(false));
      return;
    }
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

  document.querySelectorAll('[data-github-target]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (!desktop) return;
      event.preventDefault();
      desktop.openGitHubTarget(link.dataset.githubTarget)
        .catch((error) => showError('链接没有打开', error));
    });
  });
  document.querySelectorAll('.export-actions a').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (!desktop) return;
      event.preventDefault();
      const kind = link.href.endsWith('/json') ? 'json' : 'sqlite';
      setBusy(true);
      desktop.saveExport(kind).then((result) => {
        if (result.status === 'saved') showToast(`${result.fileName} 已保存`);
      }).catch((error) => showError('导出没有完成', error)).finally(() => setBusy(false));
    });
  });
  byId('open-data-directory').addEventListener('click', () => {
    desktop?.openDataDirectory().catch((error) => showError('数据目录没有打开', error));
  });
}

async function setupDesktopMetadata() {
  if (!desktop) return;
  document.documentElement.dataset.desktop = 'true';
  byId('open-data-directory').hidden = false;
  const avatarButton = byId('avatar-form').querySelector('button[type="submit"]');
  if (avatarButton) avatarButton.textContent = '选择并更新';
  const restoreButton = byId('restore-form').querySelector('button[type="submit"]');
  if (restoreButton) restoreButton.textContent = '选择备份并恢复';
  try {
    const version = await desktop.getVersionInfo();
    byId('about-version').textContent = version.version;
    byId('about-commit').textContent = version.buildCommit;
  } catch (error) {
    showError('桌面版本信息不可用', error);
  }
}

function setup() {
  const pageStage = document.querySelector('.page-stage');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  pageStage.scrollTop = 0;
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
  await setupDesktopMetadata();
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
