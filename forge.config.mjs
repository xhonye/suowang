import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { ElectronegativityPlugin } from '@electron-forge/plugin-electronegativity';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { APP_VERSION, deriveMacOSVersions } from './src/server/app-meta.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const icons = resolve(root, 'assets', 'brand');
const macVersions = deriveMacOSVersions(APP_VERSION);
const macIdentity = process.env.APPLE_CODESIGN_IDENTITY?.trim();
const appleId = process.env.APPLE_ID?.trim();
const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim();
const appleTeamId = process.env.APPLE_TEAM_ID?.trim();
const windowsCertificateFile = process.env.WINDOWS_CERTIFICATE_FILE?.trim();
const windowsCertificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;

function shouldIgnore(path) {
  const normalized = String(path).split(sep).join('/');
  const normalizedRoot = root.split(sep).join('/').replace(/\/$/, '');
  const local = normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)
    ? normalized.slice(normalizedRoot.length + 1)
    : normalized.replace(/^\/+/, '');
  if (!local || local.startsWith('..')) return false;
  const [top] = local.split('/');
  const allowedTop = new Set(['assets', 'desktop', 'migrations', 'node_modules', 'src', 'index.html', 'LICENSE', 'package.json']);
  if (!allowedTop.has(top)) return true;
  if (top === 'assets') {
    const allowedAssets = [
      'assets/brand/',
      'assets/mainline-scene-bright-office-v1-no-arrows-geometry-v5.png',
      'assets/mainline-scene-bright-office-v1-arrow-restore-light-v2.png',
      'assets/mainline-scene-bright-office-v1-arrow-work-light-v4.png',
      'assets/mainline-scene-bright-office-v1-arrow-life-light-v2.png',
    ];
    return !allowedAssets.some((allowed) => local === allowed.replace(/\/$/, '') || local.startsWith(allowed));
  }
  if (local.startsWith('node_modules/better-sqlite3/prebuilds/')) {
    return local !== `node_modules/better-sqlite3/prebuilds/${process.platform}-${process.arch}.node`;
  }
  return false;
}

const packagerConfig = {
  asar: true,
  executableName: 'SUOWANG',
  appBundleId: 'com.xhonye.suowang',
  helperBundleId: 'com.xhonye.suowang.helper',
  appCategoryType: 'public.app-category.productivity',
  appCopyright: 'Copyright © SUOWANG contributors',
  appVersion: APP_VERSION,
  buildVersion: macVersions.bundleVersion,
  icon: process.platform === 'darwin'
    ? resolve(icons, 'suowang-app-icon.icns')
    : resolve(icons, 'suowang-app-icon.ico'),
  ignore: shouldIgnore,
  overwrite: true,
  prune: true,
  win32metadata: {
    CompanyName: 'SUOWANG',
    FileDescription: '人生主线驾驶舱',
    OriginalFilename: 'SUOWANG.exe',
    ProductName: '所往 SUOWANG',
    InternalName: 'SUOWANG',
    'requested-execution-level': 'asInvoker',
  },
  extendInfo: {
    CFBundleDisplayName: '所往 SUOWANG',
    CFBundleName: 'SUOWANG',
    CFBundleShortVersionString: macVersions.shortVersion,
    CFBundleVersion: macVersions.bundleVersion,
    LSApplicationCategoryType: 'public.app-category.productivity',
    NSHighResolutionCapable: true,
  },
};

if (windowsCertificateFile) {
  packagerConfig.windowsSign = {
    certificateFile: windowsCertificateFile,
    certificatePassword: windowsCertificatePassword,
    description: '所往 SUOWANG',
    website: 'https://github.com/xhonye/suowang',
    hashes: ['sha256'],
  };
}
if (macIdentity) {
  packagerConfig.osxSign = { identity: macIdentity, hardenedRuntime: true };
  if (appleId && applePassword && appleTeamId) {
    packagerConfig.osxNotarize = { appleId, appleIdPassword: applePassword, teamId: appleTeamId };
  }
}

export default {
  packagerConfig,
  // better-sqlite3 13 ships N-API platform binaries. Normal developer packaging verifies that binary;
  // release builders set SUOWANG_FORCE_NATIVE_REBUILD=1 to make Forge rebuild it on the target OS.
  rebuildConfig: {
    onlyModules: process.env.SUOWANG_FORCE_NATIVE_REBUILD === '1' ? ['better-sqlite3'] : [],
  },
  makers: [
    new MakerZIP({}, ['win32']),
    new MakerDMG({
      name: `SUOWANG-${APP_VERSION}-mac-arm64`,
      icon: resolve(icons, 'suowang-app-icon.icns'),
      overwrite: false,
      format: 'ULFO',
      contents: (options) => [
        { x: 190, y: 210, type: 'file', path: options.appPath },
        { x: 460, y: 210, type: 'link', path: '/Applications' },
      ],
      additionalDMGOptions: {
        'background-color': '#edf3f5',
        'icon-size': 112,
        window: { size: { width: 650, height: 430 } },
      },
    }, ['darwin']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new ElectronegativityPlugin({
      customScan: ['dangerousfunctionsjscheck', 'remotemodulejscheck'],
      severitySet: 'high',
      confidenceSet: 'firm',
      isRelative: true,
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      strictlyRequireAllFuses: true,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
      [FuseV1Options.WasmTrapHandlers]: false,
    }),
  ],
};
