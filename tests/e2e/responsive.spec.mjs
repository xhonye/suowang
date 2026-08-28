import { expect, test } from '@playwright/test';
import { openDashboard, resetApp } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

async function seed(request) {
  for (const [slotIndex, name] of [[1, '主线一'], [2, '主线二'], [3, '主线三']]) {
    expect((await request.post('/api/mainlines', { data: { stateId: 'work', slotIndex, name } })).ok()).toBeTruthy();
  }
  const snapshot = await (await request.get('/api/snapshot')).json();
  const mainlineId = snapshot.states.find((state) => state.id === 'work').currentMainlineId;
  expect((await request.post('/api/todos', { data: { stateId: 'work', mainlineId, title: '可见的下一步' } })).ok()).toBeTruthy();
}

test('desktop and 320px layouts remain reachable without horizontal overflow', async ({ page, request }) => {
  await seed(request);
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 320, height: 800 }]) {
    await page.setViewportSize(viewport);
    await openDashboard(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await expect(page.locator('.route-tab')).toHaveCount(3);
    for (const tab of await page.locator('.route-tab').all()) await expect(tab).toBeVisible();
    await expect(page.locator('.mainline-card')).toHaveCount(3);
    for (const card of await page.locator('.mainline-card').all()) {
      await expect(card).toBeVisible();
      await card.click();
    }
    await page.locator('.mainline-card', { hasText: '主线一' }).click();
    await expect(page.locator('#priority-zone')).toBeVisible();
    await expect(page.locator('#priority-content')).toContainText('可见的下一步');

    const scrollResult = await page.locator('.page-stage').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return {
        bottom: element.scrollTop + element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });
    expect(scrollResult.bottom).toBeGreaterThanOrEqual(scrollResult.scrollHeight - 1);
    if (viewport.width === 320) {
      const nav = await page.locator('.rail-nav').boundingBox();
      expect(nav).not.toBeNull();
      expect(nav.y + nav.height).toBeLessThanOrEqual(viewport.height);
    }
  }
});
