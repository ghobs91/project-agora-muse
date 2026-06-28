import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// Source: 512px master icon — scaled down for all smaller sizes
const source512 = readFileSync(join(publicDir, 'icon-512.png'));

// Standard PWA/app icon sizes (generated from 512px source)
const standardSizes = [48, 72, 96, 128, 144, 152, 256, 384, 512];
for (const size of standardSizes) {
  const name = `icon-${size}x${size}.png`;
  await sharp(source512).resize(size, size).png().toFile(join(publicDir, name));
  console.log(`Created ${name}`);
}

// 192px icon — use the pre-made icon-192.png directly
await sharp(readFileSync(join(publicDir, 'icon-192.png')))
  .png()
  .toFile(join(publicDir, 'icon-192x192.png'));
console.log('Created icon-192x192.png (from icon-192.png)');

// Maskable icons — padded safe zone on transparent background
const maskableSizes = [
  { name: 'icon-maskable-192x192.png', size: 192, padding: 0.15 },
  { name: 'icon-maskable-512x512.png', size: 512, padding: 0.15 },
];
for (const { name, size, padding } of maskableSizes) {
  const innerSize = Math.round(size * (1 - padding * 2));
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(source512).resize(innerSize, innerSize).toBuffer(),
        top: Math.round((size - innerSize) / 2),
        left: Math.round((size - innerSize) / 2),
      },
    ])
    .png()
    .toFile(join(publicDir, name));
  console.log(`Created ${name}`);
}

// Favicons
await sharp(source512).resize(16, 16).png().toFile(join(publicDir, 'favicon-16x16.png'));
console.log('Created favicon-16x16.png');

await sharp(source512).resize(32, 32).png().toFile(join(publicDir, 'favicon-32x32.png'));
console.log('Created favicon-32x32.png');

// Apple touch icon
await sharp(source512).resize(180, 180).png().toFile(join(publicDir, 'apple-touch-icon.png'));
console.log('Created apple-touch-icon.png');
