/**
 * Flood-fills black background from image edges (dark pixels only).
 * Preserves interior dark regions not connected to the border.
 *
 * Run: npm i jimp && node scripts/remove-logo-bg.mjs
 * (Backs up to static/branding/logo-original.png once.)
 */
import { Jimp } from 'jimp';
import { copyFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const target = join(root, 'static/branding/logo.png');
const backup = join(root, 'static/branding/logo-original.png');

const TOL = 42;

async function main() {
	if (!existsSync(target)) {
		console.error('Missing:', target);
		process.exit(1);
	}
	if (!existsSync(backup)) {
		copyFileSync(target, backup);
	}

	const img = await Jimp.read(target);
	const w = img.bitmap.width;
	const h = img.bitmap.height;
	const data = img.bitmap.data;

	const isDark = (idx) => {
		const r = data[idx];
		const g = data[idx + 1];
		const b = data[idx + 2];
		return r <= TOL && g <= TOL && b <= TOL;
	};

	const visited = new Uint8Array(w * h);
	const queue = [];
	const push = (x, y) => {
		const i = y * w + x;
		if (visited[i]) return;
		const idx = i * 4;
		if (!isDark(idx)) return;
		visited[i] = 1;
		queue.push([x, y]);
	};

	for (let x = 0; x < w; x++) {
		push(x, 0);
		push(x, h - 1);
	}
	for (let y = 0; y < h; y++) {
		push(0, y);
		push(w - 1, y);
	}

	const dirs = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	];
	while (queue.length) {
		const [x, y] = queue.shift();
		const i = y * w + x;
		const idx = i * 4;
		data[idx + 3] = 0;

		for (const [dx, dy] of dirs) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
			push(nx, ny);
		}
	}

	await img.write(target);
	console.log('Updated', target, `(${w}x${h})`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
