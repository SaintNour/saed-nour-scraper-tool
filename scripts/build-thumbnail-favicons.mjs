/**
 * Build square favicons from branding/thumbnail.png (trim + center in frame).
 * Run after: node scripts/make-logo-transparent.mjs thumbnail.png
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandingDir = path.join(root, 'web', 'static', 'branding');
const source = path.join(brandingDir, 'thumbnail.png');

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function writeSquare(size, outName, { fillFrame = false } = {}) {
  let pipeline = sharp(source).trim({ threshold: 12 });
  pipeline = pipeline.resize(size, size, {
    fit: fillFrame ? 'cover' : 'contain',
    position: 'centre',
    background: transparent,
  });
  await pipeline.png({ compressionLevel: 9 }).toFile(path.join(brandingDir, outName));
  console.log(`Wrote ${outName} (${size}x${size}, ${fillFrame ? 'cover' : 'contain'})`);
}

await writeSquare(32, 'favicon-32.png', { fillFrame: true });
await writeSquare(48, 'favicon-48.png', { fillFrame: true });
await writeSquare(64, 'favicon-64.png', { fillFrame: true });
await writeSquare(128, 'favicon-128.png', { fillFrame: true });
await writeSquare(192, 'favicon-192.png', { fillFrame: true });
await writeSquare(256, 'chat-avatar.png', { fillFrame: false });
