import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const DEFAULT_WINDOW_STATE = Object.freeze({
  width: 1440,
  height: 900,
  maximized: false,
});

const MIN_WIDTH = 960;
const MIN_HEIGHT = 680;

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeBounds(value = {}) {
  const bounds = {
    width: finiteNumber(value.width) ? Math.max(MIN_WIDTH, Math.round(value.width)) : DEFAULT_WINDOW_STATE.width,
    height: finiteNumber(value.height) ? Math.max(MIN_HEIGHT, Math.round(value.height)) : DEFAULT_WINDOW_STATE.height,
  };
  if (finiteNumber(value.x) && finiteNumber(value.y)) {
    bounds.x = Math.round(value.x);
    bounds.y = Math.round(value.y);
  }
  return bounds;
}

function intersectionArea(bounds, workArea) {
  const left = Math.max(bounds.x ?? workArea.x, workArea.x);
  const top = Math.max(bounds.y ?? workArea.y, workArea.y);
  const right = Math.min((bounds.x ?? workArea.x) + bounds.width, workArea.x + workArea.width);
  const bottom = Math.min((bounds.y ?? workArea.y) + bounds.height, workArea.y + workArea.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

export function ensureVisibleWindowState(value, displays = []) {
  const bounds = normalizeBounds(value);
  const workAreas = displays.map((display) => display.workArea ?? display).filter((area) => (
    finiteNumber(area?.x)
      && finiteNumber(area?.y)
      && finiteNumber(area?.width)
      && finiteNumber(area?.height)
  ));
  if (!workAreas.length) return { ...bounds, maximized: Boolean(value?.maximized) };

  const visible = Object.hasOwn(bounds, 'x')
    && workAreas.some((area) => intersectionArea(bounds, area) >= 64 * 64);
  if (!visible) {
    const primary = workAreas[0];
    bounds.width = Math.min(bounds.width, primary.width);
    bounds.height = Math.min(bounds.height, primary.height);
    bounds.x = primary.x + Math.round((primary.width - bounds.width) / 2);
    bounds.y = primary.y + Math.round((primary.height - bounds.height) / 2);
  }
  return { ...bounds, maximized: Boolean(value?.maximized) };
}

export function loadWindowState(path, displays = []) {
  if (!existsSync(path)) return ensureVisibleWindowState(DEFAULT_WINDOW_STATE, displays);
  try {
    return ensureVisibleWindowState(JSON.parse(readFileSync(path, 'utf8')), displays);
  } catch {
    return ensureVisibleWindowState(DEFAULT_WINDOW_STATE, displays);
  }
}

export function saveWindowState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  const normalized = normalizeBounds(state);
  const payload = { ...normalized, maximized: Boolean(state?.maximized) };
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, path);
  return payload;
}
