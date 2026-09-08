import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../../assets/brand/suowang-scenic-mark-v1.png', import.meta.url));
const output = new URL('./Package/obj/icons/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [name, size] of [['Store', 50], ['Tile', 150], ['App', 44]]) {
  await sharp(source).resize(size, size).png().toFile(fileURLToPath(new URL(`${name}.png`, output)));
}
