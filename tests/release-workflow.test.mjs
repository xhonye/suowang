import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import packageMetadata from '../package.json' with { type: 'json' };

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('core CI runs dynamic temporary smoke on Node 22 and 24 across all supported platforms', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /- run: npm run smoke:temp/);
  for (const os of ['ubuntu-latest', 'windows-latest', 'macos-14']) {
    assert.match(workflow, new RegExp(`- os: ${os}\\s+node: '22'`));
    assert.match(workflow, new RegExp(`- os: ${os}\\s+node: '24\\.15\\.0'`));
  }
  assert.match(packageMetadata.scripts['release:check'], /npm run smoke:temp/);
});

test('candidate builds require a full commit SHA and cannot mutate a published Release', () => {
  for (const path of [
    '.github/workflows/release-windows.yml',
    '.github/workflows/release-macos.yml',
  ]) {
    const workflow = read(path);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /sha:/);
    assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
    assert.doesNotMatch(workflow, /types:\s*\[published\]/);
    assert.doesNotMatch(workflow, /--clobber/);
    assert.doesNotMatch(workflow, /gh release upload/);
  }
  const windows = read('.github/workflows/release-windows.yml');
  assert.match(windows, /SUOWANG\.exe/);
  assert.match(windows, /SUOWANG-Lite\.exe/);
  assert.match(windows, /PowerShell child|command shell/);
  assert.match(windows, /Invoke-PackagedSmoke \$shortcutPath \$shortcutData 'desktop-shortcut'/);
  assert.match(windows, /\$result\.version -ne \$version/);
  assert.match(windows, /\$setupProcess = Start-Process -FilePath \$desktopSetup/);
  assert.match(windows, /verify-windows-lite-package\.ps1 -VerifyShortcut/);
  assert.match(read('scripts/verify-windows-lite-package.ps1'), /\$setupProcess = Start-Process -FilePath \$setupPath/);
  assert.match(windows, /\$uninstallProcess = Start-Process -FilePath \$uninstaller/);
  assert.match(windows, /\$setupProcess\.ExitCode/);
  assert.match(windows, /\$uninstallProcess\.ExitCode/);
  assert.doesNotMatch(windows, /& \$desktopSetup|& \$uninstaller/);
  assert.match(read('.github/workflows/release-windows.yml'), /unins000\.exe/);
  assert.match(read('.github/workflows/release-macos.yml'), /hdiutil attach/);
  assert.match(read('.github/workflows/release-macos.yml'), /Contents\/MacOS\/SUOWANG/);
});

test('macOS release explicitly builds the DMG maker native dependency', () => {
  const script = read('scripts/build-macos-release.sh');
  assert.match(script, /npm rebuild macos-alias --ignore-scripts=false --foreground-scripts/);
  assert.match(script, /npm rebuild fs-xattr --ignore-scripts=false --foreground-scripts/);
  assert.match(script, /macos-alias\/build\/Release\/volume\.node/);
  assert.match(script, /fs-xattr\/build\/Release\/xattr\.node/);
  assert.match(read('forge.config.mjs'), /title: 'SUOWANG'/);
});

test('candidate packaging verifies the locked better-sqlite3 N-API prebuild by default', () => {
  assert.match(packageMetadata.scripts['release:windows'], /-UseBundledNapiPrebuild/);
  assert.match(read('scripts/build-macos-release.sh'), /export SUOWANG_FORCE_NATIVE_REBUILD=0/);
  assert.match(read('scripts/verify-desktop-package.mjs'), /better-sqlite3.*prebuilds/);
});

test('Windows release hashing does not depend on optional PowerShell modules', () => {
  const script = read('scripts/build-windows-release.ps1');
  assert.match(script, /System\.Security\.Cryptography\.SHA256/);
  assert.doesNotMatch(script, /Get-FileHash/);
});

test('Windows release discovers the Forge output without a non-ASCII PowerShell literal', () => {
  const script = read('scripts/build-windows-release.ps1');
  assert.doesNotMatch(script, /所往 SUOWANG-win32/);
  assert.match(script, /\.EndsWith\("-win32-\$Architecture"/);
  assert.match(script, /Join-Path \$_\.FullName 'SUOWANG\.exe'/);
  assert.match(script, /Expected exactly one Forge package/);
});

test('Windows browser cleanup tolerates transient filesystem locks', () => {
  const teardown = read('tests/e2e/global-teardown.mjs');
  assert.match(teardown, /retryableCodes = new Set\(\['EBUSY', 'ENOTEMPTY', 'EPERM'\]\)/);
  assert.match(teardown, /attempt < 60/);
  assert.match(teardown, /await wait\(250\)/);
});

test('source launchers enforce the documented Node 22 or 24 LTS contract', () => {
  const launcher = read('scripts/start.ps1');
  assert.match(launcher, /\$nodeMajor -notin @\(22, 24\)/);
  assert.match(launcher, /\[hashtable\]\$policyInput/);
  assert.doesNotMatch(launcher, /\[hashtable\]\$input/);
  assert.match(launcher, /ToBase64String/);
  const installer = read('INSTALL.cmd');
  assert.match(installer, /"%NODE_MAJOR%"=="22"/);
  assert.match(installer, /"%NODE_MAJOR%"=="24"/);
});

test('publishing verifies both candidate runs and keeps the Release private until all assets exist', () => {
  const workflow = read('.github/workflows/publish-release.yml');
  assert.match(workflow, /INSTALL_VERIFIED/);
  assert.match(workflow, /Build Windows candidate/);
  assert.match(workflow, /Build macOS Apple Silicon candidate/);
  assert.match(workflow, /--draft --prerelease --verify-tag/);
  assert.match(workflow, /select\(\.tag_name == \\"\$RELEASE_TAG\\" and \.draft == true\)/);
  assert.match(workflow, /gh api --method PATCH "\$release_endpoint" -F draft=false -F prerelease=true/);
  assert.doesNotMatch(workflow, /releases\/tags\/\$RELEASE_TAG/);
  assert.match(workflow, /create-mirror-manifest\.mjs/);
  assert.match(workflow, /MIRROR-MANIFEST\.txt/);
  assert.match(workflow, /ELECTRON_VERSION/);
  assert.match(workflow, /WINDOWS_SIGNING_STATUS/);
  assert.match(workflow, /MACOS_SIGNING_STATUS/);
  assert.match(workflow, /SIGNING-STATUS\.txt/);
  assert.match(workflow, /--notes-file/);
  assert.match(workflow, /Refusing to replace existing tag/);
  assert.doesNotMatch(workflow, /--clobber/);
});

test('desktop packaging preserves stable application identities and direct executable entry points', () => {
  const forge = read('forge.config.mjs');
  const installer = read('installer/SUOWANG.iss');
  assert.match(forge, /appBundleId: 'com\.xhonye\.suowang'/);
  assert.match(forge, /executableName: 'SUOWANG'/);
  assert.match(installer, /AppId=\{\{65D34BEA-B5D2-42E8-BF6C-44AB2B7E309A\}/);
  assert.match(installer, /Filename: "\{app\}\\\{#AppExe\}"/);
  assert.doesNotMatch(installer, /start\.ps1|SUOWANG\.cmd/);
});

test('Lite packaging uses a distinct installer identity and a no-console native entry point', () => {
  const installer = read('installer/SUOWANG-Lite.iss');
  const launcher = read('windows-lite/SUOWANGLiteLauncher.cs');
  const build = read('scripts/build-windows-release.ps1');
  const verifier = read('scripts/verify-windows-lite-package.ps1');
  const startScript = read('scripts/start.ps1');
  const startBytes = readFileSync(new URL('../scripts/start.ps1', import.meta.url));
  assert.match(installer, /AppId=\{\{43D37C7B-85BD-4690-B31A-9F468B06BE90\}/);
  assert.match(installer, /SUOWANG-Lite\.exe/);
  assert.match(build, /\/target:winexe/);
  assert.match(build, /verify-node-download\.mjs/);
  assert.match(build, /SUOWANG-Lite-Setup-\$version\.exe/);
  assert.match(verifier, /Get-PeSubsystem/);
  assert.match(verifier, /VisibleShells/);
  assert.match(verifier, /latest-launcher-error\.log/);
  assert.match(verifier, /New-Object -ComObject WScript\.Shell/);
  assert.match(verifier, /desktop-shortcut-target/);
  assert.match(verifier, /AddSeconds\(45\)/);
  assert.match(startScript, /Set-Content -LiteralPath \$failureLog/);
  assert.deepEqual([...startBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(launcher, /latest-launcher-error\.log/);
  assert.match(launcher, /UseShellExecute = false/);
  assert.match(launcher, /CreateNoWindow = true/);
  assert.match(launcher, /WindowStyle = ProcessWindowStyle\.Hidden/);
  assert.match(launcher, /RedirectStandardError = true/);
  assert.match(launcher, /process\.StandardError\.ReadToEnd\(\)/);
});

test('packaged candidates require approved road assets in ASAR and decoded in the renderer', () => {
  const verifier = read('scripts/verify-desktop-package.mjs');
  const desktopMain = read('desktop/main.js');
  const windowsWorkflow = read('.github/workflows/release-windows.yml');
  assert.match(verifier, /statAsarFile/);
  assert.match(verifier, /Required visual asset is missing from app\.asar/);
  assert.match(verifier, /visualAssetsLoaded/);
  assert.match(desktopMain, /naturalWidth/);
  assert.match(desktopMain, /naturalHeight/);
  assert.match(desktopMain, /Packaged renderer did not become ready/);
  assert.match(windowsWorkflow, /rendererReady/);
  assert.match(windowsWorkflow, /visualAssetsLoaded/);
  assert.match(windowsWorkflow, /attempt -lt 50/);
  assert.match(windowsWorkflow, /bounded shutdown wait/);
  assert.match(windowsWorkflow, /Get-Process -Id \$owner/);
  assert.match(windowsWorkflow, /MainWindowHandle/);
});
