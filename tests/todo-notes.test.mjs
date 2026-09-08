import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { createServiceHarness } from './helpers.mjs';

test('notes validate and survive lifecycle, backup and restore without changing pointers', async context => {
  const { service, runtime, dataDir } = createServiceHarness(context);
  let data = service.createTodo({ stateId: 'work', title: 'Asset allocation', notes: 'Long-term importance\nMy own reasoning' });
  const id = data.states[1].stateTodos[0].id;
  service.startPriorityTodo(id);
  service.updateTodo(id, { notes: 'Updated\nSecond line' });
  assert.equal(service.snapshot().states[1].startedTodoId, id);
  assert.throws(() => service.updateTodo(id, { notes: 'x'.repeat(4001) }));
  const backup = join(dataDir, 'notes-test.db');
  await runtime.backupTo(backup);
  service.updateTodo(id, { notes: '' });
  assert.equal(service.snapshot().states[1].stateTodos[0].notes, '');
  await runtime.restoreFrom(backup);
  assert.equal(service.snapshot().states[1].stateTodos[0].notes, 'Updated\nSecond line');
  service.endTodo(id, 'completed');
  assert.equal(service.snapshot().history.find(item => item.id === id).notes, 'Updated\nSecond line');
  assert.throws(() => service.updateTodo(id, { notes: 'Cannot edit history' }));
  service.reopenTodo(id);
  assert.equal(service.snapshot().states[1].stateTodos[0].notes, 'Updated\nSecond line');
});
