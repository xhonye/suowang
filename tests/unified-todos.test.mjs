import assert from 'node:assert/strict';
import test from 'node:test';
import { createServiceHarness } from './helpers.mjs';

test('all new items repeat; doing today and ending are independent', context => {
  const { service } = createServiceHarness(context);
  const item = service.createTodo({ stateId: 'work', title: 'One-off or recurring' }).states[1].stateTodos[0];
  assert.equal(item.kind, 'ongoing');
  assert.equal(item.completionCount, 0);
  service.recordTodoOccurrence(item.id);
  assert.equal(service.snapshot().states[1].stateTodos[0].status, 'active');
  assert.throws(() => service.recordTodoOccurrence(item.id), e => e.code === 'already_completed_today');
  service.endTodo(item.id, 'completed');
  assert.equal(service.snapshot().history.find(t => t.id === item.id).completionCount, 1);
  const other = service.createTodo({ stateId: 'life', title: 'End without doing', kind: 'single' }).states[2].stateTodos[0];
  assert.equal(other.kind, 'ongoing'); // Older clients cannot recreate the removed UI distinction.
  service.endTodo(other.id, 'completed');
  assert.equal(service.snapshot().history.find(t => t.id === other.id).completionCount, 0);
});

test('migration converts only active single items without inventing occurrences', context => {
  const { service, runtime } = createServiceHarness(context);
  const a = service.createTodo({ stateId: 'work', title: 'Active', notes: 'Keep this' }).states[1].stateTodos[0];
  const b = service.createTodo({ stateId: 'life', title: 'History' }).states[2].stateTodos[0];
  service.endTodo(b.id, 'completed');
  runtime.db.prepare("UPDATE todos SET kind = 'single'").run();
  runtime.db.prepare('DELETE FROM schema_migrations WHERE version = 9').run();
  runtime.runMigrations({ existingDatabase: true });
  const active = service.snapshot().states[1].stateTodos[0];
  assert.equal(active.id, a.id);
  assert.equal(active.kind, 'ongoing');
  assert.equal(active.notes, 'Keep this');
  assert.equal(active.completionCount, 0);
  assert.equal(service.snapshot().history.find(t => t.id === b.id).kind, 'single');
  service.reopenTodo(b.id);
  assert.equal(service.snapshot().states[2].stateTodos[0].kind, 'ongoing');
});
