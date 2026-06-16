import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svgBuffer = readFileSync(join(publicDir, 'icon.svg'));

const sizes = [
  { name: 'icon-192x192.png', width: 192, height: 192, padding: 0 },
  { name: 'icon-512x512.png', width: 512, height: 512, padding: 0 },
  { name: 'icon-maskable-192x192.png', width: 192, height: 192, padding: 0.15 },
  { name: 'icon-maskable-512x512.png', width: 512, height: 512, padding: 0.15 },
  { name: 'apple-touch-icon.png', width: 180, height: 180, padding: 0 },
  { name: 'favicon-32x32.png', width: 32, height: 32, padding: 0 },
];

for (const { name, width, height, padding } of sizes) {
  const paddedSize = Math.round(width * (1 + padding * 2));

  if (padding > 0) {
    // For maskable: render SVG at reduced size on a transparent padded canvas
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
  } else {
    await sharp(svgBuffer)
      .resize(width, height)
      .png()
      .toFile(join(publicDir, name));
  }
  console.log(`Created ${name}`);
}

// favicon.ico (multi-size)
const faviconSizes = [16, 32, 48];
const faviconBuffers = await Promise.all(
  faviconSizes.map((size) =>
    sharp(svgBuffer).resize(size, size).png().toBuffer()
  )
);
// Sharp doesn't support .ico directly; use the 32x32 PNG as fallback
// The manifest references the PNG favicon instead.
console.log('Favicon PNGs generated');
console.log('All icons generated successfully.');
