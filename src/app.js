export const STORAGE_KEY = 'suowang.prototype.v1';

export const DEFAULT_PATHS = [
  {
    id: 'restore',
    icon: 'leaf',
    title: '恢复精力',
    summary: '优先照顾身心，恢复能量与稳定的生活节律。',
    status: 'recommended',
    horizon: '2–4 周',
    reason: '睡眠与环境干扰正在占用判断带宽。先降低现实噪声，后面的选择才更可靠。',
    success: '能稳定睡眠、看清本周重点，并连续三天按清楚的节奏行动。',
    cost: '暂停非必要的新系统和新项目，只保留维护与真正紧急的事。',
    timeline: {
      today: [
        ['固定今晚的停机时间', '用一个明确时间保护睡眠窗口。'],
        ['清掉一个最刺眼的现实干扰', '只处理一个，不扩成大整理。'],
        ['写下明早第一步', '让明天醒来不需要重新做决定。'],
      ],
      week: [
        ['建立可重复的晚间收尾', '连续三天即可，不追求完美。'],
        ['把噪音事项整理成一个处理入口', '证据、沟通和下一步集中，不在脑中循环。'],
        ['保留一个无目标恢复时段', '让休息本身拥有合法位置。'],
      ],
      month: [
        ['恢复可预测的日常节律', '大多数早晨知道今天最重要的事。'],
        ['重新评估工作与系统投入', '在状态较稳时再做阶段选择。'],
      ],
      later: [
        ['9月 · 选择下一阶段主线', '以真实精力和现实进展为证据。'],
      ],
    },
    now: {
      title: '写下今晚的停机时间',
      why: '先保护一个可控的睡眠窗口，不需要今天解决所有问题。',
      duration: '8 分钟',
      energy: '低',
      priority: '低负担',
      done: '确定一个时间，并把它放进今晚能看见的位置。',
      fallback: '只决定“最晚几点不再开新任务”，写在纸上。',
    },
  },
  {
    id: 'work',
    icon: 'briefcase',
    title: '工作推进',
    summary: '聚焦关键工作，提升产出，积累成就与突破。',
    status: 'active',
    horizon: '4–8 周',
    reason: '集中投入一个关键成果，可能带来比同时推进多个项目更高的现实回报。',
    success: '形成可展示、可评审、能推动下一节点的完整工作成果。',
    cost: '所往与其他工具只做必要维护，暂不继续扩建基础设施。',
    timeline: {
      today: [
        ['完成项目需求评审与关键问题澄清', '明确关键问题与结论。'],
        ['输出项目计划初稿并发送给相关同事', '形成可评审的共同起点。'],
        ['完成 30 分钟专注工作（番茄钟）', '只推进当前最重要的一步。'],
      ],
      week: [
        ['推进核心模块开发，完成 80% 进度', '把主要精力投入核心模块。'],
        ['与产品经理对齐需求变更', '减少后续返工。'],
        ['整理本周工作复盘与下周计划', '保留下周可直接进入的上下文。'],
      ],
      month: [
        ['完成项目阶段性交付', '获得明确验收结果。'],
        ['优化工作流程，沉淀 1 份方法文档', '把有效做法变成可复用资产。'],
        ['学习一项新技能（如：数据分析 / AI 工具）', '只选一项能服务当前工作的能力。'],
      ],
      later: [
        ['10月 · 根据真实结果决定是否延续', '不以忙碌感代替进展。'],
      ],
    },
    now: {
      title: '完成项目需求评审与关键问题澄清',
      why: '明确需求能减少返工，节省后续大量时间，让项目更顺利推进。',
      duration: '45 分钟',
      energy: '中',
      priority: '高优先级',
      done: '关键问题有明确结论，并形成可以发给相关同事的评审记录。',
      fallback: '只打开评审材料，圈出最不清楚的三个问题。',
    },
  },
  {
    id: 'system',
    icon: 'home',
    title: '生活主线',
    summary: '经营重要关系与生活质量，构建长期幸福感。',
    status: 'candidate',
    horizon: '4 周',
    reason: '已经积累的工具只有进入稳定日常，才会把过去的投入转化成现实收益。',
    success: '连续两周每天打开同一个入口，并由它推动至少一个现实行动。',
    cost: '暂停新的 Agent、Skill 与外围工具探索，先消化现有能力。',
    timeline: {
      today: [
        ['选定唯一日常入口', '入口固定比功能完整更重要。'],
        ['完成一次真实使用', '用它决定并完成一件现实事项。'],
      ],
      week: [
        ['每天从同一页面开始', '记录哪里仍需要思考。'],
        ['只修最高频的一个阻力', '不扩成重构。'],
        ['删掉一个重复入口', '减少选择成本。'],
      ],
      month: [
        ['形成稳定的日常驾驶节奏', '使用先于扩展。'],
        ['根据使用证据决定下一功能', '没有证据就不增加。'],
      ],
      later: [
        ['9月 · 评估系统是否真的改变行动', '以行为结果而非 token 用量判断。'],
      ],
    },
    now: {
      title: '用所往完成一次真实导航',
      why: '先验证这个入口能否减少一次重新思考。',
      duration: '20 分钟',
      energy: '低至中',
      priority: '待选择',
      done: '从页面选出一件现实行动并完成，不继续开发。',
      fallback: '只打开页面，读一遍当前主线和 NOW 卡。',
    },
  },
];

export function createDefaultState() {
  return {
    paths: structuredClone(DEFAULT_PATHS),
    activePathId: 'work',
    selectedPathId: 'work',
    view: 'timeline',
    history: [],
  };
}

export function getPath(state, id = state.selectedPathId) {
  return state.paths.find((path) => path.id === id) ?? state.paths[0];
}

export function getTimelineItems(path, horizon) {
  return path.timeline[horizon] ?? [];
}

function pathIconSvg(kind) {
  const icons = {
    leaf: '<path d="M18.8 5.1C12.4 5 7.4 7.3 5.7 12.2c-1 2.8.1 5.1 2 6.4 1.4 1.1 4 1 5.8-.4 3.6-2.8 4.3-7.6 5.3-13.1Z"/><path d="M4.4 20c2.5-4.2 5.6-7.3 9.5-9.4"/>',
    briefcase: '<rect x="3.5" y="7.2" width="17" height="12.5" rx="2.2"/><path d="M8.2 7.2V5.6c0-.8.6-1.4 1.4-1.4h4.8c.8 0 1.4.6 1.4 1.4v1.6M3.5 12.2h17M9.7 11.2v2.1h4.6v-2.1"/>',
    home: '<path d="m3.8 11.2 8.2-7 8.2 7v8.2a1.5 1.5 0 0 1-1.5 1.5H5.3a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M9.2 20.9v-6.5h5.6v6.5"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[kind] ?? icons.briefcase}</svg>`;
}

function timelineLabels(now = new Date()) {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    today: ['今天', `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`],
    week: ['本周', `${monday.getMonth() + 1}月${monday.getDate()}日 – ${sunday.getMonth() + 1}月${sunday.getDate()}日`],
    month: ['本月', `${now.getMonth() + 1}月1日 – ${now.getMonth() + 1}月${monthEnd.getDate()}日`],
    later: ['再往前', '下一复盘点'],
  };
}

export function activatePath(state, pathId, at = new Date()) {
  if (state.activePathId === pathId) return state;
  const previous = getPath(state, state.activePathId);
  const next = getPath(state, pathId);
  return {
    ...state,
    activePathId: pathId,
    paths: state.paths.map((path) => ({
      ...path,
      status: path.id === pathId ? 'active' : path.id === previous.id ? 'paused' : path.status,
    })),
    history: [
      {
        id: `${previous.id}-${at.toISOString()}`,
        title: previous.title,
        endedAt: at.toISOString(),
        nextTitle: next.title,
        path: structuredClone(previous),
        candidates: state.paths.map(({ id, title, status }) => ({ id, title, status })),
        observedOutcome: null,
      },
      ...state.history,
    ],
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.paths?.length) return createDefaultState();
    return { ...createDefaultState(), ...saved };
  } catch {
    return createDefaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

if (typeof document !== 'undefined') {
  let state = loadState();
  const byId = (id) => document.getElementById(id);
  const pathChoices = byId('path-choices');
  const timelineGroups = byId('timeline-groups');
  const toast = byId('toast');
  const statusLabels = {
    candidate: '候选',
    recommended: '推荐',
    active: '当前',
    reviewing: '复盘中',
    complete: '已完成',
    paused: '已暂停',
  };

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function renderPaths() {
    pathChoices.innerHTML = state.paths.map((path) => `
      <button class="path-card ${path.id === state.selectedPathId ? 'selected' : ''} ${path.id === state.activePathId ? 'active' : ''}"
        type="button" data-path-id="${path.id}" aria-pressed="${path.id === state.selectedPathId}">
        <span class="path-icon path-icon-${path.id}">${pathIconSvg(path.icon)}</span>
        <span class="path-card-copy">
          <strong>${escapeHtml(path.title)}</strong>
          <small>${escapeHtml(path.summary)}</small>
          <span class="path-status">${escapeHtml(statusLabels[path.status] ?? path.status)}</span>
        </span>
        <span class="path-open" aria-hidden="true">展开 ↗</span>
      </button>
    `).join('');

    const routeLayers = [
      ['[data-route-scene]', 'routeScene'],
    ];
    routeLayers.forEach(([selector, datasetKey]) => {
      document.querySelectorAll(selector).forEach((layer) => {
        const routeId = layer.dataset[datasetKey];
        layer.classList.toggle('selected', routeId === state.selectedPathId);
        layer.classList.toggle('active', routeId === state.activePathId);
      });
    });
  }

  function renderDetails() {
    const selected = getPath(state);
    const active = getPath(state, state.activePathId);
    byId('side-active-title').textContent = active.title;
    byId('active-path-title').textContent = active.title;
    byId('active-path-summary').textContent = active.summary;
    byId('detail-title').textContent = selected.title;
    byId('detail-summary').textContent = selected.summary;
    byId('detail-reason').textContent = selected.reason;
    byId('detail-success').textContent = selected.success;
    byId('detail-cost').textContent = selected.cost;
    byId('detail-later').textContent = selected.timeline.later.map(([title]) => title).join('；');
    byId('activate-button').disabled = selected.id === state.activePathId;
    byId('activate-button').textContent = selected.id === state.activePathId ? '正在走这条路' : '设为当前主线';

    const labels = timelineLabels();
    const scheduleLabels = {
      today: ['10:00', '15:00', '20:00'],
      week: ['周五', '周三', '周日'],
      month: [`${new Date().getMonth() + 1}月25日`, `${new Date().getMonth() + 1}月30日`, `${new Date().getMonth() + 1}月31日`],
      later: ['下次复盘'],
    };
    timelineGroups.innerHTML = Object.entries(labels).map(([horizon, [label, range]]) => {
      const items = getTimelineItems(selected, horizon);
      return `<section class="time-group">
        <div class="time-label"><strong>${label}</strong><span>${range}</span></div>
        <div class="time-items">${items.map(([title], index) => `
          <div class="time-item"><i aria-hidden="true"></i><strong>${escapeHtml(title)}</strong><small>${scheduleLabels[horizon][index] ?? selected.horizon}</small></div>
        `).join('')}</div>
      </section>`;
    }).join('');

    document.querySelectorAll('[data-view]').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
    });
    byId('timeline-view').hidden = state.view !== 'timeline';
    byId('details-view').hidden = state.view !== 'details';

    byId('now-title').textContent = selected.now.title;
    byId('now-why').textContent = selected.now.why;
    byId('now-duration').textContent = selected.now.duration;
    byId('now-energy').textContent = selected.now.priority ?? selected.now.energy;
    byId('now-done').textContent = selected.now.done;
    byId('now-fallback').textContent = selected.now.fallback;
  }

  function render() {
    renderPaths();
    renderDetails();
    saveState(state);
  }

  pathChoices.addEventListener('click', (event) => {
    const button = event.target.closest('[data-path-id]');
    if (!button) return;
    state.selectedPathId = button.dataset.pathId;
    state.view = 'timeline';
    render();
  });

  document.querySelectorAll('[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.view = tab.dataset.view;
      render();
    });
  });

  byId('activate-button').addEventListener('click', () => {
    const selected = getPath(state);
    state = activatePath(state, selected.id);
    render();
    showToast(`已把“${selected.title}”设为当前主线`);
  });

  byId('fallback-button').addEventListener('click', () => {
    const fallback = byId('fallback');
    fallback.hidden = !fallback.hidden;
    byId('fallback-button').setAttribute('aria-expanded', String(!fallback.hidden));
  });

  byId('start-button').addEventListener('click', () => {
    const current = getPath(state).now;
    showToast(`开始：${current.title}。做到完成定义就停。`);
    byId('start-button').classList.add('started');
    byId('start-button').querySelector('span').textContent = '这一步已开始';
  });

  const editDialog = byId('edit-dialog');
  byId('edit-button').addEventListener('click', () => {
    const selected = getPath(state);
    byId('edit-title').value = selected.title;
    byId('edit-summary').value = selected.summary;
    byId('edit-now').value = selected.now.title;
    editDialog.showModal();
  });
  byId('save-edit').addEventListener('click', (event) => {
    if (!byId('edit-form').reportValidity()) {
      event.preventDefault();
      return;
    }
    state.paths = state.paths.map((path) => path.id === state.selectedPathId ? {
      ...path,
      title: byId('edit-title').value.trim(),
      summary: byId('edit-summary').value.trim(),
      now: { ...path.now, title: byId('edit-now').value.trim() },
    } : path);
    render();
    showToast('路径内容已保存在这个浏览器');
  });

  const historyDialog = byId('history-dialog');
  byId('history-button').addEventListener('click', () => {
    byId('history-list').innerHTML = state.history.length
      ? state.history.map((item) => `<article><time>${new Date(item.endedAt).toLocaleDateString('zh-CN')}</time><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.path?.reason ?? '当时未记录选择原因')}</p><p>转向 ${escapeHtml(item.nextTitle)}</p></article>`).join('')
      : '<p class="empty-state">还没有切换记录。探索路径不会产生记录，只有明确设为当前主线才会。</p>';
    historyDialog.showModal();
  });
  byId('close-history').addEventListener('click', () => historyDialog.close());

  render();
}
