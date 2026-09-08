import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';

const brand = new URL('../assets/brand/', import.meta.url);
const source = new URL('suowang-scenic-mark-v1.png', brand);

test('shipped PNG icons match the scenic sidebar logo, including transparent corners', async () => {
  for (const [name, size] of [['favicon.png', 64], ...[256, 512, 1024].map(size => [`suowang-app-icon-${size}.png`, size])]) {
    const icon = new URL(name, brand);
    const actual = await sharp(await readFile(icon)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const expected = await sharp(await readFile(source)).resize(size, size).ensureAlpha().raw().toBuffer();
    assert.equal(actual.info.width, size, name);
    assert.equal(actual.info.height, size, name);
    assert.deepEqual(actual.data, expected, `${name} must show the current scenic mark`);
    for (const pixel of [0, size - 1, size * (size - 1), size * size - 1]) {
      assert.equal(actual.data[pixel * 4 + 3], 0, `${name} corner must be transparent`);
    }
  }
});

test('Windows icon includes all six sizes and their scenic RGBA pixels', async () => {
  const ico = await readFile(new URL('suowang-app-icon.ico', brand));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 6);
  const sizes = [];
  for (let i = 0; i < 6; i++) {
    const entry = 6 + i * 16;
    const size = ico[entry] || 256;
    sizes.push(size);
    assert.equal(ico[entry + 1] || 256, size);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.ok(offset + length <= ico.length);
    assert.equal(ico.readUInt32LE(offset), 40, 'expected a Windows bitmap header');
    assert.equal(ico.readUInt16LE(offset + 14), 32, 'full alpha bitmap');
    const expected = await sharp(await readFile(source)).resize(size, size).ensureAlpha().raw().toBuffer();
    // ICO stores bottom-up BGRA; compare decoded pixels, not encoder bytes.
    const actual = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const from = offset + 40 + ((size - 1 - y) * size + x) * 4;
      const to = (y * size + x) * 4;
      actual[to] = ico[from + 2]; actual[to + 1] = ico[from + 1];
      actual[to + 2] = ico[from]; actual[to + 3] = ico[from + 3];
    }
    assert.deepEqual(actual, expected, `ICO ${size}px must show the scenic mark`);
  }
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48, 64, 128, 256]);
});
