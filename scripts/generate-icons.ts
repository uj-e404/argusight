import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const SVG_PATH = join(ROOT, 'public', 'argusight-logo.svg');
const ICONS_DIR = join(ROOT, 'public', 'icons');

const sizes = [
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

async function main() {
  if (!existsSync(ICONS_DIR)) {
    mkdirSync(ICONS_DIR, { recursive: true });
  }

  const svgBuffer = readFileSync(SVG_PATH);

  for (const { name, size } of sizes) {
    const output = join(ICONS_DIR, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(output);
    console.log(`Generated ${name} (${size}x${size})`);
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
