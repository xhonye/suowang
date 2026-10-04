import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createServiceHarness, migrationsDir } from './helpers.mjs';
import { createAppServer } from '../src/server/app-server.mjs';
const work = snapshot => snapshot.states.find(state => state.id === 'work');

function setup(context, scope) {
  const { service, runtime } = createServiceHarness(context);
  let mainlineId = null;
  if (scope === 'mainline') {
    mainlineId = work(service.createMainline({ stateId: 'work', slotIndex: 1, name: 'Writing' })).mainlines[0].id;
  }
  for (const title of ['Outline', 'Draft', 'Review']) service.createTodo({ stateId: 'work', mainlineId, title });
  const list = state => mainlineId ? state.mainlines.find(line => line.id === mainlineId).todos : state.stateTodos;
  const ids = list(work(service.snapshot())).map(todo => todo.id);
  service.setPriorityTodo(ids[1]);
  service.startPriorityTodo(ids[1]);
  return { service, runtime, mainlineId, list, ids };
}

for (const scope of ['state', 'mainline']) {
  test(`same-scope reorder preserves started next step in ${scope} list and across restart`, context => {
    const { service, runtime, mainlineId, list, ids } = setup(context, scope);
    const snapshot = service.moveTodo(ids[1], { mainlineId, position: 3 });
    const state = work(snapshot);
    assert.deepEqual(list(state).map(todo => todo.id), [ids[0], ids[2], ids[1]]);
    assert.equal(state.priorityTodoId, ids[1], 'sorting must preserve the selected next step');
    assert.equal(state.startedTodoId, ids[1], 'sorting must not pause the current action');
    runtime.close(); runtime.open();
    assert.equal(work(service.snapshot()).startedTodoId, ids[1], 'action remains started after reopen');
  });
  test(`same-position drop preserves started next step in ${scope} list`, context => {
    const { service, mainlineId, list, ids } = setup(context, scope);
    const state = work(service.moveTodo(ids[1], { mainlineId, position: 2 }));
    assert.deepEqual(list(state).map(todo => todo.id), ids);
    assert.equal(state.priorityTodoId, ids[1]);
    assert.equal(state.startedTodoId, ids[1], 'dropping at the original position must not pause');
  });
}

test('scope change still clears action, keeps identity and preserves next-step eligibility', context => {
  const { service, ids } = setup(context, 'state');
  const a = work(service.createMainline({ stateId: 'work', slotIndex: 1, name: 'Current' })).mainlines[0];
  let state = work(service.moveTodo(ids[1], { mainlineId: a.id, position: 1 }));
  assert.equal(state.priorityTodoId, ids[1]);
  assert.equal(state.startedTodoId, null, 'changing ownership must pause');
  assert.equal(state.mainlines[0].todos[0].id, ids[1]);
  service.startPriorityTodo(ids[1]);
  state = work(service.moveTodo(ids[1], { mainlineId: null, position: 3 }));
  assert.equal(state.priorityTodoId, ids[1]);
  assert.equal(state.startedTodoId, null);
  const b = work(service.createMainline({ stateId: 'work', slotIndex: 2, name: 'Other' })).mainlines.find(line => line.name === 'Other');
  service.startPriorityTodo(ids[1]);
  state = work(service.moveTodo(ids[1], { mainlineId: b.id, position: 1 }));
  assert.notEqual(state.priorityTodoId, ids[1], 'non-current mainline cannot supply next step');
  assert.equal(state.startedTodoId, null);
});

test('reordering another item preserves action; invalid move is atomic; completion still hands off', context => {
  const { service, ids } = setup(context, 'state');
  let state = work(service.moveTodo(ids[0], { mainlineId: null, position: 3 }));
  assert.equal(state.startedTodoId, ids[1]);
  const before = service.snapshot();
  assert.throws(() => service.moveTodo(ids[1], { position: 0 }), error => error.code === 'validation_error');
  assert.deepEqual(service.snapshot(), before);
  state = work(service.recordTodoOccurrence(ids[1]));
  assert.equal(state.startedTodoId, null);
  assert.equal(state.priorityTodoId, ids[2]);
  assert.equal(state.stateTodos.find(todo => todo.id === ids[1]).completionCount, 1);
});

test('real HTTP drag-sort request preserves the started next step', async context => {
  const dataDir = mkdtempSync(join(tmpdir(), 'suowang-reorder-http-'));
  const server = await createAppServer({ dataDir, migrationsDir, ensureBackup: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function post(path, body = {}, expectedStatus = 200) {
    const response = await fetch(`${origin}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, expectedStatus);
    return response.json();
  }
  await post('/api/todos', { stateId: 'work', title: 'Outline' }, 201);
  const created = await post('/api/todos', { stateId: 'work', title: 'Draft' }, 201);
  const ids = work(created).stateTodos.map(todo => todo.id);
  await post(`/api/todos/${ids[1]}/priority`);
  await post(`/api/todos/${ids[1]}/start`);
  const state = work(await post(`/api/todos/${ids[1]}/move`, { mainlineId: null, position: 1 }));
  assert.deepEqual(state.stateTodos.map(todo => todo.id), [ids[1], ids[0]]);
  assert.equal(state.priorityTodoId, ids[1]);
  assert.equal(state.startedTodoId, ids[1], 'same request sent by dashboard drag-and-drop must preserve action');
});
