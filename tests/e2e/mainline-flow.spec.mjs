import { expect, test } from '@playwright/test';
import {
  addMinimalStep,
  createMainline,
  createTodo,
  editMainlineField,
  openDashboard,
  resetApp,
  selectMode,
} from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('persists mode, current mainline, next step and minimal step after refresh', async ({ page }) => {
  await openDashboard(page);
  await selectMode(page, '工作');
  await createMainline(page, '可靠性冻结');
  await editMainlineField(page, 'goal', '让升级和启动值得信任');
  await editMainlineField(page, 'successCriteria', '完整闸门全部通过');
  await createTodo(page, '完成浏览器回归');
  await addMinimalStep(page, '完成浏览器回归', '先跑启动测试');
  await createTodo(page, '整理冻结报告');

  const target = page.locator('.todo-row', { hasText: '完成浏览器回归' });
  await target.dragTo(page.locator('#priority-zone'));
  await expect(page.locator('#priority-content')).toContainText('完成浏览器回归');
  await expect(page.locator('#priority-content')).toContainText('先跑启动测试');

  await page.reload();
  await expect(page.locator('#loading-layer')).toBeHidden();
  await expect(page.getByRole('tab', { name: /工作/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.mainline-card.current')).toContainText('可靠性冻结');
  await expect(page.locator('[data-field="goal"]')).toContainText('让升级和启动值得信任');
  await expect(page.locator('[data-field="successCriteria"]')).toContainText('完整闸门全部通过');
  await expect(page.locator('#priority-content')).toContainText('完成浏览器回归');
  await expect(page.locator('#priority-content')).toContainText('先跑启动测试');
});
