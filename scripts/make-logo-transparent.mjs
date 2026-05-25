/**
 * Strip flat / checkerboard backgrounds from branding PNGs (transparent alpha).
 * Run: npm install sharp --no-save && node scripts/make-logo-transparent.mjs
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandingDir = path.join(root, 'web', 'static', 'branding');
const argFiles = process.argv.slice(2);
const targets = argFiles.length
  ? argFiles
  : ['logo.png', 'logo-original.png', 'thumbnail.png', 'chat-avatar.png'];

const COLOR_DISTANCE = 58;

function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function isBackgroundLike(r, g, b, refs) {
  for (const [br, bg, bb] of refs) {
    if (colorDistance(r, g, b, br, bg, bb) <= COLOR_DISTANCE) return true;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const luminance = (r + g + b) / 3;
  if (saturation < 45 && luminance > 150) return true;
  if (luminance > 228 && saturation < 30) return true;
  return false;
}

async function processFile(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const cornerCoords = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const cornerRefs = cornerCoords.map(([x, y]) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  });

  function push(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (!isBackgroundLike(data[i], data[i + 1], data[i + 2], cornerRefs)) return;
    visited[idx] = 1;
    queue.push(idx);
  }

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (queue.length) {
    const idx = queue.pop();
    const x = idx % width;
    const y = (idx - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  for (let idx = 0; idx < width * height; idx++) {
    if (visited[idx]) {
      data[idx * 4 + 3] = 0;
    }
  }

  const tmpPath = `${filePath}.tmp.png`;
  await sharp(data, {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(tmpPath);
  await fs.rename(tmpPath, filePath);

  console.log(`Updated ${path.relative(root, filePath)} (${width}x${height})`);
}

for (const name of targets) {
  await processFile(path.join(brandingDir, name));
}
