import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('reduced motion suppresses strong animation and never moves road layers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  await createMainline(page, '低动态测试');
  await createTodo(page, '安静出发');
  const before = await page.locator('.road-base').boundingBox();

  await page.getByRole('button', { name: '开始 安静出发' }).click();
  await expect(page.locator('#priority-content')).toContainText('正在走这一步');
  const after = await page.locator('.road-base').boundingBox();
  expect(after).toEqual(before);
  const strongAnimations = await page.evaluate(() => document.getAnimations().filter((animation) => {
    const duration = Number(animation.effect?.getComputedTiming().duration ?? 0);
    return animation.playState === 'running' && duration > 20;
  }).length);
  expect(strongAnimations).toBe(0);
});
