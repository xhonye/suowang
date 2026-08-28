import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp, snapshot } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('start, refresh, pause and complete keep journey semantics distinct', async ({ page, request }) => {
  await openDashboard(page);
  await createMainline(page, '行动测试');
  await createTodo(page, '第一步');
  await createTodo(page, '接棒事项');

  await page.getByRole('button', { name: '开始 第一步' }).click();
  await expect(page.locator('#priority-content')).toContainText('正在走这一步');
  await page.reload();
  await expect(page.locator('#priority-content')).toContainText('正在走这一步');

  await page.getByRole('button', { name: '暂停 第一步' }).click();
  await expect(page.getByRole('button', { name: '开始 第一步' })).toBeVisible();
  let data = await snapshot(request);
  expect(data.history.some((item) => item.name === '第一步')).toBeFalsy();
  expect(data.states.find((state) => state.id === 'work').startedTodoId).toBeNull();

  await page.getByRole('button', { name: '开始 第一步' }).click();
  await page.locator('#priority-content').getByRole('button', { name: '完成 第一步' }).click();
  await expect(page.locator('#priority-content')).toContainText('接棒事项');
  data = await snapshot(request);
  expect(data.history.some((item) => item.name === '第一步' && item.status === 'completed')).toBeTruthy();
});
