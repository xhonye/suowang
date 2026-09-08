import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp, snapshot } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('an empty cockpit leads straight to a first step without requiring a mainline', async ({ page, request }, testInfo) => {
  for (const [width, height] of [[1920, 1080], [2560, 1440], [320, 800]]) {
    await resetApp(request);
    await page.setViewportSize({ width, height });
    await openDashboard(page);
    const zone = page.locator('#priority-zone');
    await expect(zone).toContainText('不必先想好整条主线');
    const action = zone.getByRole('button', { name: '添加第一步' });
    const zoneBox = await zone.boundingBox();
    const buttonBox = await action.boundingBox();
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(zoneBox.y + zoneBox.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await zone.screenshot({ path: testInfo.outputPath(`first-step-${width}.png`) });
    await action.click();
    const input = page.getByRole('textbox', { name: '添加其他事项' });
    await expect(input).toBeFocused();
    await input.fill('先收好桌上的一张纸');
    await input.press('Enter');
    await expect(page.getByRole('button', { name: '开始 先收好桌上的一张纸' })).toBeFocused();
    await page.getByRole('button', { name: '开始 先收好桌上的一张纸' }).click();
    await expect(zone).toContainText('正在走这一步');
    const state = (await snapshot(request)).states.find((item) => item.id === 'work');
    expect(state.mainlines).toHaveLength(0);
    expect(state.stateTodos).toHaveLength(1);
    expect(state.startedTodoId).toBe(state.stateTodos[0].id);
  }
});

test('empty next step adds into the current mainline and quietly closes completed ongoing work', async ({ page, request }) => {
  await openDashboard(page);
  await createMainline(page, '让桌面清爽');
  await page.getByRole('button', { name: '添加第一步' }).click();
  await expect(page.getByRole('textbox', { name: '添加当前主线事项' })).toBeFocused();
  await createTodo(page, '收好水杯', { ongoing: true });
  await page.getByRole('button', { name: '记录今天完成 收好水杯' }).click();
  await expect(page.locator('#priority-zone')).toContainText('今天的持续事项已完成');
  await expect(page.locator('#priority-zone')).not.toContainText('拖');
  await page.getByRole('button', { name: '再添一步' }).click();
  const input = page.getByRole('textbox', { name: '添加当前主线事项' });
  await expect(input).toBeFocused();
  await input.fill('打开文档');
  await input.press('Enter');
  await expect(page.locator('#priority-zone')).toContainText('打开文档');
  const state = (await snapshot(request)).states.find((item) => item.id === 'work');
  expect(state.mainlines[0].todos).toHaveLength(2);
  expect(state.stateTodos).toHaveLength(0);
});

test('an empty pointer with eligible existing work offers a reachable choice at all supported sizes', async ({ page, request }, testInfo) => {
  const title = '把这件很长的事情拆成可以开始的一小步，'.repeat(8).slice(0, 160);
  const response = await request.post('/api/todos', { data: { stateId: 'work', title, kind: 'ongoing' } });
  expect(response.ok()).toBeTruthy();
  // This snapshot shape occurs after all ongoing work was done and the local day changes.
  // The real clock transition and explicit selection are covered in the service test.
  await page.route('**/api/snapshot', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.states.find((state) => state.id === 'work').priorityTodoId = null;
    await route.fulfill({ response, json: data });
  });
  for (const [width, height] of [[1920, 1080], [2560, 1440], [320, 800]]) {
    await page.setViewportSize({ width, height });
    await openDashboard(page);
    const zone = page.locator('#priority-zone');
    await expect(zone).toContainText('准备好再出发');
    await expect(zone).toContainText(title);
    await expect(page.getByRole('button', { name: '添加第一步' })).toHaveCount(0);
    const action = page.getByRole('button', { name: '选为下一步', exact: true });
    const zoneBox = await zone.boundingBox();
    const buttonBox = await action.boundingBox();
    expect(buttonBox.y + buttonBox.height, `${width}px existing-item choice must fit`).toBeLessThanOrEqual(zoneBox.y + zoneBox.height);
    await zone.screenshot({ path: testInfo.outputPath(`existing-choice-${width}.png`) });
    await action.click();
    await expect(zone.locator('[data-start-todo]')).toBeFocused();
  }
  const state = (await snapshot(request)).states.find((item) => item.id === 'work');
  expect(state.stateTodos).toHaveLength(1);
  expect(state.priorityTodoId).toBe(state.stateTodos[0].id);
});
