import { expect, test } from '@playwright/test';
import { openDashboard, resetApp } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('returning to cockpit picks up companion changes without reloading', async ({ page, request }) => {
  await openDashboard(page);
  const response = await request.post('/api/todos', { data: { stateId: 'work', title: 'Companion item', minimalStep: 'Pick up a ruler' } });
  expect(response.ok()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#priority-content')).toContainText('Companion item');
  const snapshot = await response.json();
  const id = snapshot.states.find(s => s.id === 'work').priorityTodoId;
  expect((await request.post(`/api/todos/${id}/start`, { data: {} })).ok()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#priority-content')).toContainText('正在走这一步');
});

test('companion refresh leaves an active input intact', async ({ page, request }) => {
  await openDashboard(page);
  const input = page.locator('#state-todo-form input');
  await input.fill('Unsaved draft');
  expect((await request.post('/api/todos', { data: { stateId: 'work', title: 'External item' } })).ok()).toBeTruthy();
  let reads = 0;
  page.on('request', r => { if (r.url().endsWith('/api/snapshot')) reads++; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(input).toHaveValue('Unsaved draft');
  expect(reads).toBe(0);
});
