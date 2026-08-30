import { _electron as electron, expect, test } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseRuntime } from '../../src/server/database.mjs';
import { createMainline, createTodo } from '../e2e/helpers.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('secure desktop window preserves the complete local workflow', async () => {
  const testRoot = mkdtempSync(join(tmpdir(), 'suowang-electron-e2e-'));
  const dataDir = join(testRoot, 'data');
  const jsonExport = join(testRoot, 'suowang-export.json');
  const sqliteExport = join(testRoot, 'suowang-backup.db');
  const avatarPath = join(root, 'assets', 'brand', 'suowang-app-icon-256.png');
  const externalRequests = [];
  let electronApp;
  let origin;
  try {
    electronApp = await electron.launch({
      args: ['desktop/main.js'],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test', SUOWANG_DATA_DIR: dataDir },
    });
    const page = await electronApp.firstWindow();
    expect(await electronApp.evaluate(({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData') })))
      .toEqual({ userData: join(dataDir, 'electron-test-profile'), sessionData: join(dataDir, 'electron-test-profile') });
    origin = new URL(page.url()).origin;
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== origin && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) {
        externalRequests.push(request.url());
      }
    });

    await electronApp.evaluate(async ({ dialog, shell }, paths) => {
      globalThis.__suowangOpenedUrls = [];
      shell.openExternal = async (url) => { globalThis.__suowangOpenedUrls.push(url); };
      dialog.showSaveDialog = async (_parent, options) => ({
        canceled: false,
        filePath: options.filters?.[0]?.extensions?.includes('json') ? paths.jsonExport : paths.sqliteExport,
      });
      dialog.showOpenDialog = async (_parent, options) => ({
        canceled: false,
        filePaths: [options.title.includes('头像') ? paths.avatarPath : paths.sqliteExport],
      });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }, { jsonExport, sqliteExport, avatarPath });

    await expect(page.locator('#loading-layer')).toBeHidden();
    await expect(page.getByRole('heading', { name: '人生主线驾驶舱' })).toBeVisible();
    assert.ok((await page.screenshot()).length > 10_000);
    expect(page.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(await page.evaluate(() => typeof globalThis.require)).toBe('undefined');
    expect(await page.evaluate(() => typeof globalThis.process)).toBe('undefined');
    expect(await page.evaluate(() => Boolean(globalThis.suowangDesktop))).toBe(true);
    expect(await electronApp.evaluate(({ BrowserWindow }) => {
      const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        nodeIntegration: preferences.nodeIntegration,
        contextIsolation: preferences.contextIsolation,
        sandbox: preferences.sandbox,
        webSecurity: preferences.webSecurity,
      };
    })).toEqual({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });

    await createMainline(page, '桌面壳验收');
    await createTodo(page, '完成独立窗口');
    await page.getByRole('button', { name: '完成 完成独立窗口' }).first().click();
    await page.locator('[data-page="history"]').click();
    await expect(page.locator('#history-list')).toContainText('完成独立窗口');

    await page.locator('[data-page="settings"]').click();
    await page.locator('#display-name-input').fill('桌面验收');
    await page.locator('#display-name-form').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('#profile-name')).toHaveText('桌面验收');
    await page.getByRole('button', { name: '选择并更新' }).click();
    await expect(page.locator('#profile-avatar img')).toBeVisible();

    await page.getByRole('link', { name: '下载 JSON 可读导出' }).click();
    await expect.poll(() => existsSync(jsonExport)).toBe(true);
    await page.getByRole('link', { name: '下载 SQLite 完整备份' }).click();
    await expect.poll(() => existsSync(sqliteExport)).toBe(true);
    assert.ok(statSync(jsonExport).size > 100);
    assert.ok(statSync(sqliteExport).size > 1024);

    await page.locator('[data-page="dashboard"]').click();
    await createTodo(page, '恢复后应消失', { scope: 'state' });
    await page.locator('[data-page="settings"]').click();
    await page.getByRole('button', { name: '选择备份并恢复' }).click();
    await expect(page.locator('#dashboard-page')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('恢复后应消失');

    await page.locator('[data-page="settings"]').click();
    await page.getByRole('link', { name: '提交问题' }).click();
    expect(await electronApp.evaluate(() => globalThis.__suowangOpenedUrls)).toEqual(['https://github.com/xhonye/suowang/issues']);

    expect(await page.evaluate(() => window.open('https://example.com') === null)).toBe(true);
    await page.evaluate(() => { window.location.href = 'https://example.com/blocked'; });
    await page.waitForTimeout(250);
    expect(new URL(page.url()).origin).toBe(origin);
    expect(externalRequests).toEqual([]);

    const serviceOrigin = origin;
    await electronApp.close();
    electronApp = null;
    await expect.poll(async () => {
      try { await fetch(`${serviceOrigin}/health`); return false; } catch { return true; }
    }).toBe(true);
    const reopened = new DatabaseRuntime({ dataDir, migrationsDir: join(root, 'migrations') });
    assert.equal(reopened.db.prepare('PRAGMA integrity_check').pluck().get(), 'ok');
    reopened.close();
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    rmSync(testRoot, { recursive: true, force: true });
  }
});
