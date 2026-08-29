import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const brandDir = join(root, 'assets', 'brand');
const source = join(brandDir, 'suowang-app-icon.svg');

mkdirSync(brandDir, { recursive: true });
for (const size of [1024, 512, 256]) {
  await sharp(source).resize(size, size).png().toFile(join(brandDir, `suowang-app-icon-${size}.png`));
}
await sharp(source).resize(64, 64).png().toFile(join(brandDir, 'favicon.png'));

const icoBuffers = [];
for (const size of [256, 128, 64, 48, 32, 16]) {
  icoBuffers.push(await sharp(source).resize(size, size).png().toBuffer());
}
writeFileSync(join(brandDir, 'suowang-app-icon.ico'), await pngToIco(icoBuffers));

if (process.platform === 'darwin') {
  const iconset = join(brandDir, 'suowang-app-icon.iconset');
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  for (const [points, pixels, suffix = ''] of [
    [16, 16], [16, 32, '@2x'], [32, 32], [32, 64, '@2x'], [128, 128], [128, 256, '@2x'],
    [256, 256], [256, 512, '@2x'], [512, 512], [512, 1024, '@2x'],
  ]) {
    await sharp(source).resize(pixels, pixels).png().toFile(join(iconset, `icon_${points}x${points}${suffix}.png`));
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(brandDir, 'suowang-app-icon.icns')], { stdio: 'inherit' });
  rmSync(iconset, { recursive: true, force: true });
}

process.stdout.write('SUOWANG brand icons are up to date.\n');
