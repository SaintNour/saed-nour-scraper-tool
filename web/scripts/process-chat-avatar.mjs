/**
 * Removes solid black backdrop, tightens to content, pads to a centered square
 * so the avatar reads as a full circular face.
 *
 * Usage: node scripts/process-chat-avatar.mjs <input.png> [output.png]
 */
import { Jimp } from 'jimp';
import { readFileSync } from 'fs';

const TOL = 42;
const PAD_FRAC = 0.04;

function floodRemoveBlack(img) {
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
}

function alphaBBox(img, alphaMin = 8) {
	const w = img.bitmap.width;
	const h = img.bitmap.height;
	const data = img.bitmap.data;
	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const a = data[(y * w + x) * 4 + 3];
			if (a > alphaMin) {
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < minX) return null;
	return { minX, minY, maxX, maxY };
}

async function main() {
	const input = process.argv[2];
	const output = process.argv[3] ?? 'static/branding/chat-avatar.png';
	if (!input) {
		console.error('Usage: node scripts/process-chat-avatar.mjs <input.png> [output.png]');
		process.exit(1);
	}

	const buf = readFileSync(input);
	const img = await Jimp.read(buf);
	floodRemoveBlack(img);

	const box = alphaBBox(img);
	if (!box) {
		console.error('No visible content after background removal.');
		process.exit(1);
	}

	let { minX, minY, maxX, maxY } = box;
	const bw = maxX - minX + 1;
	const bh = maxY - minY + 1;
	const pad = Math.round(Math.max(bw, bh) * PAD_FRAC);
	minX = Math.max(0, minX - pad);
	minY = Math.max(0, minY - pad);
	maxX = Math.min(img.bitmap.width - 1, maxX + pad);
	maxY = Math.min(img.bitmap.height - 1, maxY + pad);

	await img.crop({
		x: minX,
		y: minY,
		w: maxX - minX + 1,
		h: maxY - minY + 1,
	});

	const side = Math.max(img.bitmap.width, img.bitmap.height);
	const newImg = new Jimp({ width: side, height: side, color: 0x00000000 });
	const ox = Math.floor((side - img.bitmap.width) / 2);
	const oy = Math.floor((side - img.bitmap.height) / 2);
	newImg.blit({ src: img, x: ox, y: oy });

	await newImg.write(output);
	console.log('Wrote', output, `${side}x${side}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
