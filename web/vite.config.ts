import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const apiProxy = {
	'/api': {
		target: 'http://127.0.0.1:3000',
		changeOrigin: true,
	},
};

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		/** Always separate from the Express API (default backend: 3000). */
		port: 5173,
		strictPort: true,
		proxy: { ...apiProxy },
	},
	preview: {
		/** Default Vite preview port; keep distinct from backend :3000. */
		port: 4173,
		strictPort: false,
		proxy: { ...apiProxy },
	},
});
