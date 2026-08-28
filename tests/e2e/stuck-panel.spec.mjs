import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

async function openStuck(page) {
  await page.getByRole('button', { name: '卡住了？' }).click();
  await expect(page.locator('#stuck-panel')).toBeVisible();
}

test('stuck panel adjusts step, item, direction and mode inside the next-step card', async ({ page }) => {
  await openDashboard(page);
  await createMainline(page, '当前方向', 1);
  await createMainline(page, '备选方向', 2);
  await page.locator('.mainline-card', { hasText: '当前方向' }).click();
  await createTodo(page, '当前事项');
  await createTodo(page, '备用事项');

  await openStuck(page);
  await page.getByRole('button', { name: /再小一点/ }).click();
  const minimalInput = page.locator('#priority-content [data-field="minimalStep"] input');
  await minimalInput.fill('只打开文件');
  await minimalInput.press('Enter');
  await expect(page.locator('#priority-content')).toContainText('只打开文件');

  await openStuck(page);
  await page.getByRole('button', { name: /换一件事/ }).click();
  await expect(page.locator('#stuck-panel')).toHaveAttribute('aria-label', '换一件事');
  await page.locator('[data-stuck-select-todo]', { hasText: '备用事项' }).click();
  await expect(page.locator('#priority-content')).toContainText('备用事项');

  await openStuck(page);
  await page.getByRole('button', { name: /看看主线/ }).click();
  await expect(page.locator('#stuck-panel')).toHaveAttribute('aria-label', '看看主线');
  await page.locator('[data-stuck-select-mainline]', { hasText: '当前方向' }).click();

  await openStuck(page);
  await page.getByRole('button', { name: /先去恢复/ }).click();
  await expect(page.getByRole('tab', { name: /恢复/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#action-dialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('#priority-zone #stuck-panel')).toHaveCount(0);
});
