import { expect, test } from '@playwright/test';
import { openDashboard, resetApp } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

async function expectSelectedAndFocused(page, name) {
  const tab = page.getByRole('tab', { name: new RegExp(name) });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(tab).toBeFocused();
}

test('route tabs support wrapped arrows plus Home and End with correct focus', async ({ page }) => {
  await openDashboard(page);
  const work = page.getByRole('tab', { name: /工作/ });
  await work.focus();
  await work.press('ArrowLeft');
  await expectSelectedAndFocused(page, '恢复');
  await page.getByRole('tab', { name: /恢复/ }).press('ArrowRight');
  await expectSelectedAndFocused(page, '工作');
  await page.getByRole('tab', { name: /工作/ }).press('End');
  await expectSelectedAndFocused(page, '生活');
  await page.getByRole('tab', { name: /生活/ }).press('Home');
  await expectSelectedAndFocused(page, '恢复');
  await page.getByRole('tab', { name: /恢复/ }).press('ArrowLeft');
  await expectSelectedAndFocused(page, '生活');
});
