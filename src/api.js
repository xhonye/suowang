async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `请求失败（${response.status}）`);
    error.code = payload?.error?.code ?? 'request_failed';
    error.details = payload?.error?.details ?? null;
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function upload(path, file) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `上传失败（${response.status}）`);
    error.code = payload?.error?.code ?? 'upload_failed';
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const api = {
  snapshot: () => request('/api/snapshot'),
  updateAppState: (lastViewedStateId) => request('/api/app-state', {
    method: 'PATCH', body: { lastViewedStateId },
  }),
  updateSettings: (changes) => request('/api/settings', { method: 'PATCH', body: changes }),
  updateState: (stateId, changes) => request(`/api/states/${stateId}`, { method: 'PATCH', body: changes }),
  createMainline: (data) => request('/api/mainlines', { method: 'POST', body: data }),
  updateMainline: (id, changes) => request(`/api/mainlines/${id}`, { method: 'PATCH', body: changes }),
  setCurrentMainline: (id) => request(`/api/mainlines/${id}/current`, { method: 'POST', body: {} }),
  moveMainline: (id, slotIndex) => request(`/api/mainlines/${id}/slot`, {
    method: 'POST', body: { slotIndex },
  }),
  endMainline: (id, data) => request(`/api/mainlines/${id}/end`, { method: 'POST', body: data }),
  deleteMainline: (id, todoPolicy) => request(`/api/mainlines/${id}`, {
    method: 'DELETE', body: { todoPolicy },
  }),
  copyMainline: (id, name) => request(`/api/mainlines/${id}/copy`, {
    method: 'POST', body: { name },
  }),
  createTodo: (data) => request('/api/todos', { method: 'POST', body: data }),
  updateTodo: (id, changes) => request(`/api/todos/${id}`, { method: 'PATCH', body: changes }),
  completeTodo: (id) => request(`/api/todos/${id}/complete`, { method: 'POST', body: {} }),
  abandonTodo: (id) => request(`/api/todos/${id}/abandon`, { method: 'POST', body: {} }),
  deleteTodo: (id) => request(`/api/todos/${id}`, { method: 'DELETE' }),
  moveTodo: (id, data) => request(`/api/todos/${id}/move`, { method: 'POST', body: data }),
  setPriority: (id) => request(`/api/todos/${id}/priority`, { method: 'POST', body: {} }),
  uploadAvatar: (file) => upload('/api/avatar', file),
  restoreDatabase: (file) => upload('/api/import/sqlite', file),
};
