import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp, snapshot } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('completed items can be reopened and historical mainlines copied with a new identity', async ({ page, request }) => {
  await openDashboard(page);
  await createMainline(page, '阶段实验');
  await createTodo(page, '可撤回事项');
  await page.getByRole('button', { name: '完成 可撤回事项' }).click();

  await page.getByRole('button', { name: '行迹' }).click();
  await expect(page.locator('#history-list')).toContainText('可撤回事项');
  await page.getByRole('button', { name: '撤回事项：可撤回事项' }).click();
  await page.getByRole('button', { name: '驾驶舱' }).click();
  await expect(page.locator('#mainline-todos')).toContainText('可撤回事项');

  await page.locator('.mainline-card', { hasText: '阶段实验' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '完成主线' }).click();
  await expect(page.locator('#end-panel')).toBeVisible();
  await page.getByRole('button', { name: '确认结束主线' }).click();
  await page.getByRole('button', { name: '行迹' }).click();
  await expect(page.locator('#history-list')).toContainText('阶段实验');
  await page.getByRole('button', { name: '复制为新主线' }).click();
  const dialog = page.locator('#action-dialog');
  await dialog.locator('input[name="name"]').fill('阶段实验');
  await dialog.getByRole('button', { name: '创建新主线' }).click();
  await expect(page.locator('.mainline-card.current')).toContainText('阶段实验');

  const data = await snapshot(request);
  const active = data.states.find((state) => state.id === 'work').mainlines.find((item) => item.name === '阶段实验');
  const historical = data.history.find((item) => item.type === 'mainline' && item.name === '阶段实验');
  expect(active.id).not.toBe(historical.id);
});
