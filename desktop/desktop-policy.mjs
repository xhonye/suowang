export const GITHUB_TARGETS = Object.freeze({
  repo: 'https://github.com/xhonye/suowang',
  issues: 'https://github.com/xhonye/suowang/issues',
  releases: 'https://github.com/xhonye/suowang/releases',
});

export const EXPORT_KINDS = Object.freeze({
  json: Object.freeze({ endpoint: '/api/export/json', fileName: 'suowang-export.json' }),
  sqlite: Object.freeze({ endpoint: '/api/export/sqlite', fileName: 'suowang-backup.db' }),
});

export const IPC_CHANNELS = Object.freeze({
  getDesktopInfo: 'suowang:get-desktop-info',
  getVersionInfo: 'suowang:get-version-info',
  openGitHubTarget: 'suowang:open-github-target',
  openDataDirectory: 'suowang:open-data-directory',
  saveExport: 'suowang:save-export',
  chooseAvatar: 'suowang:choose-avatar',
  restoreDatabase: 'suowang:restore-database',
});

export function resolveGitHubTarget(target) {
  if (!Object.hasOwn(GITHUB_TARGETS, target)) throw new TypeError('Unknown GitHub target.');
  return GITHUB_TARGETS[target];
}

export function resolveExportKind(kind) {
  if (!Object.hasOwn(EXPORT_KINDS, kind)) throw new TypeError('Unknown export kind.');
  return EXPORT_KINDS[kind];
}

export function isAllowedLocalNavigation(target, origin) {
  try {
    const candidate = new URL(target);
    const allowed = new URL(origin);
    return candidate.protocol === 'http:'
      && candidate.origin === allowed.origin
      && (candidate.username === '' && candidate.password === '');
  } catch {
    return false;
  }
}

export function isAllowedRendererRequest(target, origin) {
  if (String(target).startsWith('data:') || String(target).startsWith('blob:')) return true;
  return isAllowedLocalNavigation(target, origin);
}

export function contentTypeForAvatar(path) {
  const extension = String(path).toLowerCase().split('.').pop();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  throw new TypeError('Unsupported avatar type.');
}
