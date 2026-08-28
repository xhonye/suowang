export function stateById(snapshot, stateId) {
  return snapshot?.states?.find((state) => state.id === stateId) ?? null;
}

export function stateIdFromNavigationKey(states, currentStateId, key) {
  const stateIds = states?.map((state) => state.id) ?? [];
  if (stateIds.length === 0) return null;
  const currentIndex = Math.max(0, stateIds.indexOf(currentStateId));
  if (key === 'Home') return stateIds[0];
  if (key === 'End') return stateIds.at(-1);
  if (key === 'ArrowLeft') return stateIds[(currentIndex - 1 + stateIds.length) % stateIds.length];
  if (key === 'ArrowRight') return stateIds[(currentIndex + 1) % stateIds.length];
  return null;
}

export function currentMainline(state) {
  return state?.mainlines?.find((mainline) => mainline.id === state.currentMainlineId) ?? null;
}

export function allActiveTodos(state) {
  return [
    ...(state?.stateTodos ?? []),
    ...(state?.mainlines ?? []).flatMap((mainline) => mainline.todos ?? []),
  ];
}

export function priorityTodo(state) {
  return allActiveTodos(state).find((todo) => todo.id === state?.priorityTodoId) ?? null;
}

export function todoSource(state, todo) {
  if (!todo) return '';
  if (!todo.mainlineId) return `${state.name}模式 · 其他事项`;
  return state.mainlines.find((mainline) => mainline.id === todo.mainlineId)?.name ?? state.name;
}

export function greetingForHour(hour) {
  if (hour >= 6 && hour < 9) return '早上好';
  if (hour >= 9 && hour < 11) return '上午好';
  if (hour >= 11 && hour < 13) return '中午好';
  if (hour >= 13 && hour < 17) return '下午好';
  if (hour >= 17 && hour < 22) return '晚上好';
  return '夜深了';
}

export function daylightEmojiForHour(hour) {
  return hour >= 6 && hour < 17 ? '☀️' : '🌙';
}

export function formatLocalDate(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long', day: 'numeric', weekday: 'short',
  }).format(date);
}

export function stateName(snapshot, stateId) {
  return stateById(snapshot, stateId)?.name ?? stateId;
}

export function statusLabel(status) {
  return status === 'completed' ? '已完成' : status === 'abandoned' ? '已放弃' : '进行中';
}

export function typeLabel(type) {
  return type === 'mainline' ? '主线' : '事项';
}
