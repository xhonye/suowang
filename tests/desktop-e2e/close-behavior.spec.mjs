import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
test('close hides to tray; restore, explicit tray exit and saved quit behavior work', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'suowang-tray-e2e-'));
  let instance;
  const launch = async () => {
    instance = await electron.launch({ args: ['desktop/main.js'], cwd: root,
      env: { ...process.env, NODE_ENV: 'test', SUOWANG_DATA_DIR: dataDir } });
    const page = await instance.firstWindow();
    await expect(page.locator('#loading-layer')).toBeHidden();
    return page;
  };
  try {
    let page = await launch();
    const origin = new URL(page.url()).origin;
    await page.locator('[data-page="settings"]').click();
    await expect(page.locator('#desktop-close-behavior')).toHaveValue('tray');
    // Capture actual native tray menu callbacks, then invoke the same callbacks a user selects.
    await instance.evaluate(({ Menu, BrowserWindow }) => {
      const original = Menu.buildFromTemplate.bind(Menu);
      Menu.buildFromTemplate = (template) => { globalThis.trayTestMenu = template; return original(template); };
      BrowserWindow.getAllWindows()[0].close();
    });
    expect(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
    expect((await (await fetch(`${origin}/health`)).json()).database).toBe('ready');
    expect(existsSync(join(dataDir, 'instance.lock'))).toBe(true);
    await instance.evaluate(() => globalThis.trayTestMenu.find(i => i.label === '打开所往').click());
    expect(await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
    await page.locator('#desktop-close-behavior').selectOption('quit');
    await expect(page.locator('#desktop-close-status')).toHaveText('已保存');
    await page.locator('#desktop-close-behavior').selectOption('tray');
    await expect(page.locator('#desktop-close-status')).toHaveText('已保存');
    await instance.evaluate(() => { setTimeout(() => globalThis.trayTestMenu.find(i => i.label === '退出所往').click(), 30); });
    await instance.waitForEvent('close');
    instance = null;
    expect(existsSync(join(dataDir, 'instance.lock'))).toBe(false);
    await expect.poll(async () => { try { await fetch(`${origin}/health`); return false; } catch { return true; } }).toBe(true);
    page = await launch();
    await page.locator('[data-page="settings"]').click();
    await expect(page.locator('#desktop-close-behavior')).toHaveValue('tray');
    await page.locator('#desktop-close-behavior').selectOption('quit');
    await expect(page.locator('#desktop-close-status')).toHaveText('已保存');
    await instance.close(); instance = null;
    page = await launch();
    await page.locator('[data-page="settings"]').click();
    await expect(page.locator('#desktop-close-behavior')).toHaveValue('quit');
    await instance.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 30); });
    await instance.waitForEvent('close'); instance = null;
    expect(existsSync(join(dataDir, 'instance.lock'))).toBe(false);
  } finally {
    if (instance) await instance.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
