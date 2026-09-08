import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));
test('notes stay hidden, preserve failed edits, persist and remain readable in history', async ({ page }) => {
  await openDashboard(page);
  await createMainline(page, '备注测试');
  await createTodo(page, '资产配置');
  const notes = '对现实影响很深\n<script>不是代码</script>';
  await page.getByRole('button', { name: '资产配置的更多操作' }).click();
  await page.getByRole('menuitem', { name: '添加备注' }).click();
  const editor = page.getByRole('textbox', { name: '备注', exact: true });
  await expect(editor).toBeFocused();
  await editor.fill(notes);
  await page.route('**/api/todos/*', route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: '保存失败' } }) }) : route.continue());
  await page.getByRole('button', { name: '保存备注' }).click();
  await expect(editor).toHaveValue(notes);
  await expect(page.locator('#dialog-error')).toBeVisible();
  await page.unroute('**/api/todos/*');
  await page.getByRole('button', { name: '保存备注' }).click();
  await expect(page.locator('#action-dialog')).not.toBeVisible();
  await expect(page.locator('.todo-row')).not.toContainText('对现实影响很深');
  await page.reload();
  await page.getByRole('button', { name: '资产配置的更多操作' }).click();
  await page.getByRole('menuitem', { name: '查看 / 编辑备注' }).click();
  await expect(editor).toHaveValue(notes);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '资产配置的更多操作' }).click();
  await page.getByRole('menuitem', { name: '完成事项', exact: true }).click();
  await page.getByRole('button', { name: '行迹', exact: true }).click();
  await page.locator('.history-notes summary').click();
  await expect(page.locator('.history-notes p')).toHaveText(notes);
});
