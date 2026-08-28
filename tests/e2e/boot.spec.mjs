import { expect, test } from '@playwright/test';
import { APP_VERSION } from '../../src/server/app-meta.mjs';
import { openDashboard, resetApp } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('boots without browser errors or misleading static identity', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  await openDashboard(page);

  const health = await (await request.get('/health')).json();
  expect(health).toMatchObject({
    status: 'ok', app: 'suowang', version: APP_VERSION, database: 'ready', schemaVersion: 7, accessMode: 'local',
  });
  expect(health.pid).toBeGreaterThan(0);
  await expect(page.locator('#greeting')).toHaveText(/^(早上好|上午好|中午好|下午好|晚上好|夜深了)，所往用户$/);
  await expect(page.locator('#local-date')).not.toHaveText('正在读取日期');
  await expect(page.locator('#daylight-icon')).toHaveText(/☀️|🌙/);
  await expect(page.locator('body')).not.toContainText('Honye');
  await expect(page.locator('body')).not.toContainText('专注中');
  expect(errors).toEqual([]);
});
