import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svgBuffer = readFileSync(join(publicDir, 'icon.svg'));

const sizes = [
  { name: 'icon-maskable-192x192.png', width: 192, height: 192, padding: 0.15 },
  { name: 'icon-maskable-512x512.png', width: 512, height: 512, padding: 0.15 },
];

for (const { name, width, height, padding } of sizes) {
  const innerSize = Math.round(width * (1 - padding * 2));
  await sharp({
    create: {
      width: width,
      height: height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(svgBuffer).resize(innerSize, innerSize).toBuffer(),
        top: Math.round((height - innerSize) / 2),
        left: Math.round((width - innerSize) / 2),
      },
    ])
    .png()
    .toFile(join(publicDir, name));
  console.log(`Created ${name}`);
}

const favicon16 = join(publicDir, 'favicon-16x16.png');
if (!existsSync(favicon16)) {
  await sharp(svgBuffer).resize(16, 16).png().toFile(favicon16);
  console.log('Created favicon-16x16.png');
} else {
  console.log('Skipped favicon-16x16.png (Agora icon exists)');
}
