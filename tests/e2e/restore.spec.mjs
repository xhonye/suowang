import { expect, test } from '@playwright/test';
import { createMainline, openDashboard, resetApp, selectMode, snapshot } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('SQLite download and UI restore recover the isolated browser-test database', async ({ page, request }) => {
  await openDashboard(page);
  await selectMode(page, '生活');
  await createMainline(page, '恢复前名称');
  let data = await snapshot(request);
  const mainlineId = data.states.find((state) => state.id === 'life').mainlines[0].id;

  await page.getByRole('button', { name: '设置' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载 SQLite 完整备份' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  expect((await request.patch(`/api/mainlines/${mainlineId}`, { data: { name: '修改后名称' } })).ok()).toBeTruthy();
  data = await snapshot(request);
  expect(data.states.find((state) => state.id === 'life').mainlines[0].name).toBe('修改后名称');
  expect((await request.patch('/api/app-state', { data: { lastViewedStateId: 'work' } })).ok()).toBeTruthy();

  await page.reload();
  await expect(page.locator('#loading-layer')).toBeHidden();
  await page.getByRole('button', { name: '设置' }).click();
  await page.locator('#restore-input').setInputFiles(backupPath);
  await page.getByRole('button', { name: '选择文件并恢复' }).click();
  await page.locator('#action-dialog').getByRole('button', { name: '备份当前数据并恢复' }).click();
  await expect(page.locator('.mainline-card.current')).toContainText('恢复前名称');
  await expect(page.getByRole('tab', { name: /生活/ })).toHaveAttribute('aria-selected', 'true');

  data = await snapshot(request);
  expect(data.states.find((state) => state.id === 'life').mainlines[0].name).toBe('恢复前名称');
});
