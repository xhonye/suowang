import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp, snapshot } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('ongoing items record once per day and can undo today without streak mechanics', async ({ page, request }) => {
  await openDashboard(page);
  await createMainline(page, '稳定节律');
  await createTodo(page, '23点前睡觉', { ongoing: true });

  await page.getByRole('button', { name: '记录今天完成 23点前睡觉' }).click();
  const row = page.locator('.todo-row', { hasText: '23点前睡觉' });
  await expect(row).toContainText('↻ 1');
  await expect(row.locator('.complete-button')).toBeDisabled();
  let data = await snapshot(request);
  const todo = data.states.find((state) => state.id === 'work').mainlines[0].todos[0];
  expect(todo.completionCount).toBe(1);
  expect(todo.completedToday).toBeTruthy();

  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '撤回今天' }).click();
  await expect(row).toContainText('↻ 0');
  data = await snapshot(request);
  expect(data.states.find((state) => state.id === 'work').mainlines[0].todos[0].completionCount).toBe(0);
  await expect(page.locator('body')).not.toContainText(/streak|连续打卡|完成率/i);
});
