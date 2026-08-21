import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentMainline,
  focusDays,
  greetingForHour,
  priorityTodo,
  todoSource,
} from '../src/view-model.js';

const state = {
  id: 'work',
  name: '工作',
  currentMainlineId: 'ml_a',
  priorityTodoId: 'td_state',
  stateTodos: [{ id: 'td_state', mainlineId: null, title: '通用事项' }],
  mainlines: [
    { id: 'ml_a', name: '主线 A', todos: [{ id: 'td_a', mainlineId: 'ml_a', title: 'A' }] },
  ],
};

test('view model resolves current mainline, priority and source labels', () => {
  assert.equal(currentMainline(state).name, '主线 A');
  assert.equal(priorityTodo(state).title, '通用事项');
  assert.equal(todoSource(state, priorityTodo(state)), '工作 · 通用');
  assert.equal(todoSource(state, state.mainlines[0].todos[0]), '主线 A');
});

test('greeting boundaries follow the fixed local-time contract', () => {
  assert.deepEqual(
    [5, 6, 8, 9, 10, 11, 12, 13, 16, 17, 21, 22].map(greetingForHour),
    ['夜深了', '早上好', '早上好', '上午好', '上午好', '中午好', '中午好', '下午好', '下午好', '晚上好', '晚上好', '夜深了'],
  );
});

test('focus days count natural local dates and never show zero', () => {
  assert.equal(focusDays('2026-08-21', new Date(2026, 7, 21, 23, 59)), 1);
  assert.equal(focusDays('2026-08-21', new Date(2026, 7, 23, 0, 1)), 3);
});
