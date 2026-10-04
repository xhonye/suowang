import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createServiceHarness, migrationsDir } from './helpers.mjs';
import { createAppServer } from '../src/server/app-server.mjs';
const stateOf = (snapshot, stateId = 'work') => snapshot.states.find(state => state.id === stateId);

function setup(context, { stateId = 'work', owner = 'mainline' } = {}) {
  const { service, runtime } = createServiceHarness(context);
  const a = stateOf(service.createMainline({ stateId, slotIndex: 1, name: 'Current' }), stateId).mainlines[0];
  const b = stateOf(service.createMainline({ stateId, slotIndex: 2, name: 'Alternative' }), stateId).mainlines[1];
  const mainlineId = owner === 'mainline' ? a.id : null;
  service.createTodo({ stateId, mainlineId, title: 'Keep writing', notes: 'Preserve this note' });
  const state = stateOf(service.snapshot(), stateId);
  const todo = mainlineId ? state.mainlines[0].todos[0] : state.stateTodos[0];
  service.startPriorityTodo(todo.id);
  return { service, runtime, stateId, a, b, todo };
}

for (const stateId of ['restore', 'work', 'life']) {
  test(`changing current mainline preserves a started unassigned next step in ${stateId}`, context => {
    const { service, runtime, a, b, todo } = setup(context, { stateId, owner: 'state' });
    let state = stateOf(service.setCurrentMainline(b.id), stateId);
    assert.equal(state.currentMainlineId, b.id);
    assert.equal(state.priorityTodoId, todo.id);
    assert.equal(state.startedTodoId, todo.id, 'unchanged eligible next step must not be paused');
    state = stateOf(service.setCurrentMainline(b.id), stateId);
    assert.equal(state.startedTodoId, todo.id, 'reselecting the current mainline must not pause');
    state = stateOf(service.setCurrentMainline(a.id), stateId);
    assert.equal(state.startedTodoId, todo.id);
    runtime.close(); runtime.open();
    assert.equal(stateOf(service.snapshot(), stateId).startedTodoId, todo.id);
  });
  test(`ending current mainline preserves a started item whose ownership is unchanged in ${stateId}`, context => {
    const { service, b, todo } = setup(context, { stateId, owner: 'state' });
    const a = stateOf(service.snapshot(), stateId).mainlines[0];
    const state = stateOf(service.endMainline(a.id, { status: 'completed' }), stateId);
    assert.equal(state.currentMainlineId, b.id);
    assert.equal(state.priorityTodoId, todo.id);
    assert.equal(state.startedTodoId, todo.id);
  });
}

for (const operation of ['complete-to-state', 'abandon-to-state', 'complete-to-mainline', 'delete-to-state']) {
  test(`${operation} clears the started pointer when the next step changes ownership`, context => {
    const { service, runtime, a, b, todo } = setup(context);
    const result = operation === 'delete-to-state' ? service.deleteMainline(a.id) : service.endMainline(a.id, {
      status: operation === 'abandon-to-state' ? 'abandoned' : 'completed',
      resolutions: { [todo.id]: operation === 'complete-to-mainline' ? { target: 'mainline', mainlineId: b.id } : { target: 'state' } },
    });
    const state = stateOf(result);
    assert.equal(state.currentMainlineId, b.id);
    assert.equal(state.priorityTodoId, todo.id, 'the transferred item stays eligible as the next step');
    const relocated = [...state.stateTodos, ...state.mainlines.flatMap(line => line.todos)].find(item => item.id === todo.id);
    assert.equal(relocated.mainlineId, operation === 'complete-to-mainline' ? b.id : null);
    assert.equal(relocated.notes, todo.notes);
    assert.equal(relocated.completionCount, 0);
    assert.equal(state.startedTodoId, null, 'ownership changes must pause even when identity remains eligible');
    runtime.close(); runtime.open();
    assert.equal(stateOf(service.snapshot()).startedTodoId, null);
  });
}

test('changing to another mainline still clears a started item that becomes ineligible', context => {
  const { service, a, b, todo } = setup(context);
  const created = service.createTodo({ stateId: 'work', mainlineId: b.id, title: 'Different step' });
  const other = stateOf(created).mainlines[1].todos[0];
  const state = stateOf(service.setCurrentMainline(b.id));
  assert.equal(state.priorityTodoId, other.id);
  assert.equal(state.startedTodoId, null);
  assert.equal(state.mainlines.find(line => line.id === a.id).todos[0].id, todo.id);
});

test('invalid bulk resolution rolls back the started pointer and every item transfer', context => {
  const { service, a, todo } = setup(context);
  const created = service.createTodo({ stateId: 'work', mainlineId: a.id, title: 'Another step' });
  const other = stateOf(created).mainlines[0].todos[1];
  const before = service.snapshot();
  assert.throws(() => service.endMainline(a.id, {
    status: 'completed', resolutions: { [todo.id]: { target: 'state' }, [other.id]: { target: 'invalid' } },
  }), error => error.code === 'validation_error');
  assert.deepEqual(service.snapshot(), before);
});

async function httpHarness(context) {
  const dataDir = mkdtempSync(join(tmpdir(), 'suowang-mainline-pointer-'));
  const server = await createAppServer({ dataDir, migrationsDir, ensureBackup: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return async (path, body = {}, { method = 'POST', status = 200 } = {}) => {
    const response = await fetch(`${origin}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, status);
    return response.json();
  };
}

test('real HTTP mainline selection keeps the same started unassigned next step', async context => {
  const request = await httpHarness(context);
  const created = await request('/api/mainlines', { stateId: 'work', slotIndex: 1, name: 'Current' }, { status: 201 });
  const id = stateOf(created).mainlines[0].id;
  const result = await request('/api/todos', { stateId: 'work', title: 'Unassigned' }, { status: 201 });
  const todo = stateOf(result).stateTodos[0];
  await request(`/api/todos/${todo.id}/start`);
  const state = stateOf(await request(`/api/mainlines/${id}/current`));
  assert.equal(state.priorityTodoId, todo.id);
  assert.equal(state.startedTodoId, todo.id);
});

test('real HTTP mainline deletion pauses the next step transferred to unassigned items', async context => {
  const request = await httpHarness(context);
  const created = await request('/api/mainlines', { stateId: 'work', slotIndex: 1, name: 'Current' }, { status: 201 });
  const id = stateOf(created).mainlines[0].id;
  const result = await request('/api/todos', { stateId: 'work', mainlineId: id, title: 'Transfer me' }, { status: 201 });
  const todo = stateOf(result).mainlines[0].todos[0];
  await request(`/api/todos/${todo.id}/start`);
  const state = stateOf(await request(`/api/mainlines/${id}`, { todoPolicy: 'move_to_state' }, { method: 'DELETE' }));
  assert.equal(state.stateTodos[0].id, todo.id);
  assert.equal(state.priorityTodoId, todo.id);
  assert.equal(state.startedTodoId, null);
});

test('follow-up: swapping mainline slots preserves every started pointer', context => {
  const { service, a, b, todo } = setup(context);
  const before = service.snapshot();
  const snapshot = service.moveMainlineSlot(a.id, 2);
  const state = stateOf(snapshot);
  assert.equal(state.mainlines[0].id, b.id);
  assert.equal(state.currentMainlineId, a.id);
  assert.equal(state.priorityTodoId, todo.id);
  assert.equal(state.startedTodoId, todo.id);
  assert.deepEqual(snapshot.states.filter(item => item.id !== 'work'), before.states.filter(item => item.id !== 'work'));
});

test('follow-up: deleting current mainline preserves an unrelated unassigned action', context => {
  const { service, a, b, todo } = setup(context, { owner: 'state' });
  const state = stateOf(service.deleteMainline(a.id));
  assert.equal(state.currentMainlineId, b.id);
  assert.equal(state.priorityTodoId, todo.id);
  assert.equal(state.startedTodoId, todo.id);
});

test('follow-up: selecting mainlines does not restart a paused item', context => {
  const { service, a, b, todo } = setup(context, { owner: 'state' });
  service.pausePriorityTodo(todo.id);
  for (const id of [a.id, b.id, b.id]) {
    const state = stateOf(service.setCurrentMainline(id));
    assert.equal(state.priorityTodoId, todo.id);
    assert.equal(state.startedTodoId, null);
  }
});

test('follow-up: ending and deleting the bound action still hand off without starting another item', context => {
  for (const operation of ['abandon', 'delete']) {
    const { service, a, b, todo } = setup(context);
    const created = service.createTodo({ stateId: 'work', mainlineId: b.id, title: 'Next action' });
    const next = stateOf(created).mainlines[1].todos[0];
    const snapshot = operation === 'delete'
      ? service.deleteMainline(a.id, { todoPolicy: 'delete' })
      : service.endMainline(a.id, { status: 'completed' });
    const state = stateOf(snapshot);
    assert.equal(state.priorityTodoId, next.id);
    assert.equal(state.startedTodoId, null);
    assert.equal(snapshot.history.some(item => item.id === todo.id), operation === 'abandon');
  }
});

test('follow-up: copy and delete a historical mainline preserve an unrelated started action', context => {
  const { service, b, todo } = setup(context);
  service.endMainline(b.id, { status: 'completed' });
  let state = stateOf(service.copyMainline(b.id, { name: 'New independent direction' }));
  assert.equal(state.startedTodoId, todo.id);
  state = stateOf(service.deleteMainline(b.id));
  assert.equal(state.startedTodoId, todo.id);
});

test('follow-up: rejected cross-mode resolution preserves all modes and started pointers', context => {
  const { service, a, todo } = setup(context);
  const other = stateOf(service.createMainline({ stateId: 'life', slotIndex: 1, name: 'Other mode' }), 'life').mainlines[0];
  const before = service.snapshot();
  assert.throws(() => service.endMainline(a.id, {
    status: 'completed', resolutions: { [todo.id]: { target: 'mainline', mainlineId: other.id } },
  }), error => error.code === 'state_mismatch');
  assert.deepEqual(service.snapshot(), before);
});
