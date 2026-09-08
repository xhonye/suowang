import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp, snapshot } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

for (const [width, height] of [[1920, 1080], [2560, 1440], [320, 800]]) {
  test(`item menus choose and move a next step without dragging at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height });
    await openDashboard(page);
    await createMainline(page, '当前方向');
    await createMainline(page, '稍后的方向', 2);
    await createTodo(page, '先打开文档');
    await createTodo(page, '拿一张纸', { scope: 'state' });
    const trigger = page.getByRole('button', { name: '拿一张纸的更多操作', exact: true });
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(page.getByRole('menuitem', { name: '设为下一步' })).toBeFocused();
    const box = await menu.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: testInfo.outputPath(`item-menu-${width}.png`) });
    await menu.press('End');
    await expect(page.getByRole('menuitem', { name: '删除事项' })).toBeFocused();
    await menu.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.press('Enter');
    await page.getByRole('menuitem', { name: '设为下一步' }).press('Enter');
    await expect(page.getByRole('button', { name: '开始 拿一张纸' })).toBeFocused();
    await page.getByRole('button', { name: '开始 拿一张纸' }).click();
    let work = (await snapshot(request)).states.find((state) => state.id === 'work');
    const id = work.stateTodos[0].id;
    expect(work.startedTodoId).toBe(id);

    await trigger.click();
    await page.getByRole('menuitem', { name: '移动到…', exact: true }).click();
    await page.getByRole('combobox', { name: '移到', exact: true }).selectOption({ label: '稍后的方向' });
    await page.getByRole('button', { name: '移动事项', exact: true }).click();
    await expect(page.locator('#state-todos .todo-row')).toHaveCount(0);
    work = (await snapshot(request)).states.find((state) => state.id === 'work');
    expect(work.mainlines[1].todos[0].id).toBe(id);
    expect(work.startedTodoId).toBeNull();
    expect(work.priorityTodoId).toBe(work.mainlines[0].todos[0].id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}

test('the alternative picker and menus exclude other mainlines and ongoing work completed today', async ({ page, request }) => {
  await openDashboard(page);
  await createMainline(page, '当前方向');
  await createMainline(page, '另一个方向', 2);
  await createTodo(page, '正在做的事');
  await createTodo(page, '今天已做的事', { ongoing: true });
  await page.getByRole('button', { name: '记录今天完成 今天已做的事' }).click();
  await createTodo(page, '仍可选择的事', { scope: 'state' });
  const otherId = (await snapshot(request)).states.find((state) => state.id === 'work').mainlines[1].id;
  const response = await request.post('/api/todos', { data: { stateId: 'work', mainlineId: otherId, title: '另一主线的事' } });
  expect(response.ok()).toBeTruthy();
  await openDashboard(page);
  await page.getByRole('button', { name: '今天已做的事的更多操作', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '设为下一步' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: '撤回今天' })).toBeVisible();
  await page.getByRole('menu').press('Escape');
  await page.getByRole('button', { name: '卡住了？' }).click();
  await page.getByRole('button', { name: /换一件事/ }).click();
  await expect(page.locator('[data-stuck-select-todo]')).toHaveCount(1);
  await expect(page.locator('[data-stuck-select-todo]')).toContainText('仍可选择的事');
  await page.locator('[data-stuck-select-todo]').click();
  await expect(page.locator('#priority-content')).toContainText('仍可选择的事');
  await expect(page.locator('#error-banner')).toBeHidden();
});
