import { expect, test } from '@playwright/test';
import { createMainline, createTodo, openDashboard, resetApp, snapshot } from './helpers.mjs';

test.beforeEach(async ({ request }) => resetApp(request));

test('start, refresh, pause and complete keep journey semantics distinct', async ({ page, request }) => {
  await openDashboard(page);
  await createMainline(page, '行动测试');
  await createTodo(page, '第一步');
  await createTodo(page, '接棒事项');

  await page.getByRole('button', { name: '开始 第一步' }).click();
  await expect(page.locator('#priority-content')).toContainText('正在走这一步');
  await page.reload();
  await expect(page.locator('#priority-content')).toContainText('正在走这一步');

  await page.getByRole('button', { name: '暂停 第一步' }).click();
  await expect(page.getByRole('button', { name: '开始 第一步' })).toBeVisible();
  let data = await snapshot(request);
  expect(data.history.some((item) => item.name === '第一步')).toBeFalsy();
  expect(data.states.find((state) => state.id === 'work').startedTodoId).toBeNull();

  await page.getByRole('button', { name: '开始 第一步' }).click();
  await page.locator('#priority-content').getByRole('button', { name: '完成 第一步' }).click();
  await expect(page.locator('#priority-content')).toContainText('接棒事项');
  data = await snapshot(request);
  expect(data.history.some((item) => item.name === '第一步' && item.status === 'completed')).toBeTruthy();
});

test('active next-step background moves right without stretching or blocking controls', async ({ page, request }, testInfo) => {
  await openDashboard(page);
  await createMainline(page, '行动背景测试');
  await createTodo(page, '整理这一小步');
  const flow = page.locator('.priority-flow');
  const heights = [];
  for (const [width, height] of [[1920, 1080], [2560, 1440], [320, 800]]) {
    await page.setViewportSize({ width, height });
    const originalHeight = (await page.locator('#priority-zone').boundingBox()).height;
    const road = await page.locator('.road-base').boundingBox();
    await expect(flow).toBeHidden();
    await page.getByRole('button', { name: '开始 整理这一小步' }).click();
    await expect(flow).toBeVisible();
    await expect(flow).toHaveAttribute('aria-hidden', 'true');
    await expect(flow).toHaveCSS('pointer-events', 'none');
    const zoneBox = await page.locator('#priority-zone').boundingBox();
    const flowBox = await flow.boundingBox();
    expect(flowBox.y).toBeCloseTo(zoneBox.y + 1, 0);
    expect(flowBox.height).toBeCloseTo(zoneBox.height - 2, 0);
    const getPosition = () => flow.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el, '::before').transform).m41);
    const first = await getPosition();
    await expect.poll(getPosition).not.toBe(first);
    // Sample the rendered sweep and its quiet interval without waiting entire cycles.
    const motion = await flow.evaluate(el => {
      const animation = el.getAnimations({ subtree: true }).find(a => a.animationName === 'priority-flow-right');
      const running = animation.playState;
      animation.pause();
      const sample = time => {
        animation.currentTime = time;
        const style = getComputedStyle(el, '::before');
        return { x: new DOMMatrixReadOnly(style.transform).m41, opacity: Number(style.opacity) };
      };
      const entry = sample(150);
      const exit = sample(750);
      const quiet = sample(2000);
      const nextQuiet = sample(4000);
      animation.currentTime = 420;
      return { running, entry, exit, quiet, nextQuiet, width: el.clientWidth };
    });
    expect(motion.running).toBe('running');
    expect(motion.exit.x - motion.entry.x).toBeGreaterThan(motion.width * .6);
    expect(motion.entry.opacity).toBe(1);
    expect(motion.exit.opacity).toBe(1);
    expect(motion.quiet.opacity).toBe(0);
    expect(motion.nextQuiet).toEqual(motion.quiet);
    expect(motion.quiet.x).toBeCloseTo(motion.width, 0);
    expect((await page.locator('#priority-zone').boundingBox()).height).toBe(originalHeight);
    // Compare geometry relative to viewport after any automatic scrolling.
    expect((await page.locator('.road-base').boundingBox()).height).toBe(road.height);
    heights.push(originalHeight);
    await page.locator('#priority-zone').screenshot({ path: testInfo.outputPath(`active-${width}.png`) });
    await page.getByRole('button', { name: '暂停 整理这一小步' }).click();
    await expect(flow).toBeHidden();
  }
  expect(heights[0]).toBe(heights[1]);
  await page.getByRole('button', { name: '开始 整理这一小步' }).click();
  await page.reload();
  await expect(flow).toBeVisible();
  await page.locator('.priority-title').click();
  await expect(page.locator('.priority-title .inline-editor')).toBeFocused();
  expect(await flow.evaluate(el => getComputedStyle(el, '::before').animationPlayState)).toBe('paused');
  await page.locator('.priority-title .inline-editor').press('Escape');
  await page.locator('#stuck-toggle').click();
  await expect(flow).toBeHidden();
  await page.locator('#stuck-toggle').click();
  await expect(flow).toBeVisible();
  await page.locator('#priority-content').getByRole('button', { name: '完成 整理这一小步' }).click();
  await expect(flow).toBeHidden();
  expect((await snapshot(request)).states.find(state => state.id === 'work').startedTodoId).toBeNull();
});
