import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentMainline,
  daylightEmojiForHour,
  greetingForHour,
  priorityTodo,
  stateIdFromNavigationKey,
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
  assert.equal(todoSource(state, priorityTodo(state)), '工作模式 · 其他事项');
  assert.equal(todoSource(state, state.mainlines[0].todos[0]), '主线 A');
});

test('greeting boundaries follow the fixed local-time contract', () => {
  assert.deepEqual(
    [5, 6, 8, 9, 10, 11, 12, 13, 16, 17, 21, 22].map(greetingForHour),
    ['夜深了', '早上好', '早上好', '上午好', '上午好', '中午好', '中午好', '下午好', '下午好', '晚上好', '晚上好', '夜深了'],
  );
  assert.deepEqual(
    [5, 6, 16, 17, 21, 22].map(daylightEmojiForHour),
    ['🌙', '☀️', '☀️', '🌙', '🌙', '🌙'],
  );
});

test('route tabs navigate in fixed state order and wrap at both ends', () => {
  const states = [{ id: 'restore' }, { id: 'work' }, { id: 'life' }];
  assert.equal(stateIdFromNavigationKey(states, 'work', 'ArrowLeft'), 'restore');
  assert.equal(stateIdFromNavigationKey(states, 'work', 'ArrowRight'), 'life');
  assert.equal(stateIdFromNavigationKey(states, 'restore', 'ArrowLeft'), 'life');
  assert.equal(stateIdFromNavigationKey(states, 'life', 'ArrowRight'), 'restore');
  assert.equal(stateIdFromNavigationKey(states, 'work', 'Home'), 'restore');
  assert.equal(stateIdFromNavigationKey(states, 'work', 'End'), 'life');
  assert.equal(stateIdFromNavigationKey(states, 'work', 'Enter'), null);
});
