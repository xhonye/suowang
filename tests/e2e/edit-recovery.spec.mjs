import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp, snapshot } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

for (const [width, height] of [[1920, 1080], [2560, 1440], [320, 800]]) {
  test(`inline edits preserve failed drafts, ignore IME keys and return focus at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height });
    await openDashboard(page);
    await createMainline(page, '当前方向');
    await createMainline(page, '已有方向', 2);
    const field = page.locator('[data-edit-mainline][data-field="name"]');
    await field.click();
    const input = field.locator('input');
    await input.fill('已有方向');
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
    await input.dispatchEvent('keydown', { key: 'Escape', isComposing: true });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('已有方向');
    await input.press('Enter');
    await expect(page.locator('#error-message')).toContainText('同一模式中的进行中主线名称不能重复');
    await expect(input).toHaveValue('已有方向');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await snapshot(request)).states.find((state) => state.id === 'work').mainlines[0].name).toBe('当前方向');
    await page.screenshot({ path: testInfo.outputPath(`edit-recovery-${width}.png`) });
    await input.fill('修正后的方向');
    await input.press('Enter');
    await expect(field).toContainText('修正后的方向');
    await expect(field).toBeFocused();
    await expect(page.locator('#error-banner')).toBeHidden();
    await field.press('Enter');
    await field.locator('input').fill('不保存的改动');
    await field.locator('input').press('Escape');
    await expect(field).toBeFocused();
    await expect(field).toContainText('修正后的方向');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}

test('a disconnected edit keeps its draft and can be retried against the real service', async ({ page, request }) => {
  await openDashboard(page);
  await createTodo(page, '打开文档', { scope: 'state' });
  const field = page.locator('#state-todos [data-field="title"]');
  await field.click();
  const input = field.locator('input');
  await input.fill('打开文档写一句话');
  await page.route('**/api/todos/*', (route) => route.request().method() === 'PATCH' ? route.abort('connectionrefused') : route.continue());
  await input.press('Enter');
  await expect(page.locator('#error-message')).toContainText('暂时连接不到本地服务');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('打开文档写一句话');
  expect((await snapshot(request)).states.find((state) => state.id === 'work').stateTodos[0].title).toBe('打开文档');
  await page.unroute('**/api/todos/*');
  await input.press('Enter');
  await expect(field).toContainText('打开文档写一句话');
  await expect(field).toBeFocused();
  await expect(page.locator('#error-banner')).toBeHidden();
  expect((await snapshot(request)).states.find((state) => state.id === 'work').stateTodos[0].title).toBe('打开文档写一句话');
});

test('a failed history copy remains editable and success opens its saved mode', async ({ page, request }) => {
  let response = await request.post('/api/mainlines', { data: { stateId: 'life', slotIndex: 1, name: '曾经的方向' } });
  expect(response.ok()).toBeTruthy();
  const id = (await response.json()).states.find((state) => state.id === 'life').mainlines[0].id;
  expect((await request.post(`/api/mainlines/${id}/end`, { data: { status: 'completed', resolutions: {} } })).ok()).toBeTruthy();
  expect((await request.post('/api/mainlines', { data: { stateId: 'life', slotIndex: 1, name: '已有方向' } })).ok()).toBeTruthy();
  await openDashboard(page);
  await page.getByRole('button', { name: '行迹', exact: true }).click();
  await page.getByRole('button', { name: '复制为新主线', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '复制为新的独立主线' });
  const input = dialog.locator('input[name="name"]');
  await input.fill('已有方向');
  await dialog.getByRole('button', { name: '创建新主线', exact: true }).click();
  await expect(dialog.locator('[role="alert"]')).toContainText('名称不能重复');
  await expect(input).toHaveValue('已有方向');
  await expect(input).toBeFocused();
  await input.fill('再次出发');
  await input.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tab', { name: /生活/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#mainline-slots')).toContainText('再次出发');
  const data = await snapshot(request);
  expect(data.settings.lastViewedStateId).toBe('life');
  expect(data.states.find((state) => state.id === 'life').mainlines.filter((item) => item.name === '再次出发')).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('tab', { name: /生活/ })).toHaveAttribute('aria-selected', 'true');
});
