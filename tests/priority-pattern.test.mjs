import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';

test('solid right chevron fits its repeat tile without clipping its tip', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const rule = styles.match(/\.priority-flow::before\s*\{([^}]+)\}/)?.[1];
  const data = rule?.match(/url\("data:image\/svg\+xml,([^"]+)"\)/)?.[1];
  assert.ok(data, 'motion tile exists');
  const { data: rgba, info } = await sharp(Buffer.from(decodeURIComponent(data))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => rgba[(y * info.width + x) * 4 + 3];
  const colors = new Set();
  for (let y = 0; y < info.height; y++) {
    assert.equal(alpha(0, y), 0, 'left repeat boundary must not clip the shape');
    assert.equal(alpha(info.width - 1, y), 0, 'right repeat boundary must not clip the tip');
    for (let x = 0; x < info.width; x++) {
      if (alpha(x, y) === 255) colors.add(rgba.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3).toString('hex'));
    }
  }
  assert.equal(colors.size, 1, 'all solid pixels use a single color');
  const rightEdge = y => Array.from({ length: info.width }, (_, x) => x).filter(x => alpha(x, y) > 128).at(-1);
  assert.ok(rightEdge(Math.floor(info.height / 2)) > rightEdge(Math.floor(info.height / 4)) + 15, 'chevron points to the right');
  assert.ok(Array.from({ length: info.width }, (_, x) => alpha(x, Math.floor(info.height / 2))).filter(a => a === 255).length > 20, 'chevron is a filled block, not a thin line');
});
