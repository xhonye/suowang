import { expect } from '@playwright/test';

async function expectOk(response) {
  if (!response.ok()) {
    throw new Error(`E2E API request failed: ${response.status()} ${await response.text()}`);
  }
}

export async function resetApp(request) {
  const snapshotResponse = await request.get('/api/snapshot');
  await expectOk(snapshotResponse);
  const snapshot = await snapshotResponse.json();
  const todoIds = new Set([
    ...snapshot.states.flatMap((state) => [
      ...state.stateTodos.map((todo) => todo.id),
      ...state.mainlines.flatMap((mainline) => mainline.todos.map((todo) => todo.id)),
    ]),
    ...snapshot.history.filter((item) => item.type === 'todo').map((item) => item.id),
  ]);
  for (const id of todoIds) await expectOk(await request.delete(`/api/todos/${id}`));

  const current = await (await request.get('/api/snapshot')).json();
  const mainlineIds = new Set([
    ...current.states.flatMap((state) => state.mainlines.map((mainline) => mainline.id)),
    ...current.history.filter((item) => item.type === 'mainline').map((item) => item.id),
  ]);
  for (const id of mainlineIds) {
    await expectOk(await request.delete(`/api/mainlines/${id}`, { data: { todoPolicy: 'delete' } }));
  }
  await expectOk(await request.patch('/api/app-state', { data: { lastViewedStateId: 'work' } }));
}

export async function openDashboard(page) {
  await page.goto('/');
  await expect(page.locator('#loading-layer')).toBeHidden();
  await expect(page.getByRole('heading', { name: '人生主线驾驶舱' })).toBeVisible();
}

export async function selectMode(page, name = '工作') {
  await page.getByRole('tab', { name: new RegExp(name) }).click();
  await expect(page.getByRole('tab', { name: new RegExp(name) })).toHaveAttribute('aria-selected', 'true');
}

export async function createMainline(page, name, slot = 1) {
  await page.getByRole('button', { name: `在槽位 ${slot} 创建主线` }).click();
  const form = page.locator(`[data-create-slot="${slot}"]`);
  await form.locator('input').fill(name);
  await form.getByRole('button', { name: '创建' }).click();
  await expect(page.locator(`[data-mainline-id] .mainline-name`, { hasText: name })).toBeVisible();
}

export async function editMainlineField(page, field, value) {
  const button = page.locator(`[data-edit-mainline][data-field="${field}"]`);
  await button.click();
  await button.locator('input').fill(value);
  await button.locator('input').press('Enter');
  await expect(page.locator(`[data-edit-mainline][data-field="${field}"]`)).toContainText(value);
}

export async function createTodo(page, title, { ongoing = false, scope = 'mainline' } = {}) {
  const form = page.locator(scope === 'mainline' ? '#mainline-todo-form' : '#state-todo-form');
  if (ongoing) await form.locator('.todo-kind-toggle').click();
  await form.locator('input').fill(title);
  await form.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.locator(`[data-todo-id] .todo-title`, { hasText: title })).toBeVisible();
}

export async function addMinimalStep(page, todoTitle, minimalStep) {
  const row = page.locator('[data-todo-id]', { hasText: todoTitle }).first();
  const button = row.locator('[data-field="minimalStep"]');
  await button.click();
  await button.locator('input').fill(minimalStep);
  await button.locator('input').press('Enter');
  await expect(row).toContainText(minimalStep);
}

export async function snapshot(request) {
  const response = await request.get('/api/snapshot');
  await expectOk(response);
  return response.json();
}
