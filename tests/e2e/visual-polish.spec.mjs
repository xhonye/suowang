import { expect, test } from '@playwright/test';
import { openDashboard, resetApp } from './helpers.mjs';

test('long next-step text keeps the action reachable at desktop, scaled and narrow sizes', async ({ page, request }) => {
  await resetApp(request);
  const response = await request.post('/api/todos', { data: {
    stateId: 'work',
    title: '整理本阶段作品的核心内容，并把第一次使用时需要说明的关键步骤写清楚',
    minimalStep: '先打开现有草稿，只选出最需要讲清楚的一小段内容，写下一个具体例子，再决定是否继续补充其他部分。',
  } });
  expect(response.ok()).toBeTruthy();
  // 1536/1280 CSS pixels cover the space available to a 1920px desktop at 125/150%.
  for (const [width, height] of [[1920, 1080], [2560, 1440], [1536, 864], [1280, 720], [320, 800]]) {
    await page.setViewportSize({ width, height });
    await openDashboard(page);
    const zone = await page.locator('#priority-zone').boundingBox();
    const action = page.locator('[data-start-todo]');
    const button = await action.boundingBox();
    expect(button.y + button.height, `${width}px action must fit the next-step card`).toBeLessThanOrEqual(zone.y + zone.height);
    await action.click();
    await expect(page.locator('[data-pause-todo]')).toBeVisible();
    await page.locator('[data-pause-todo]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});
