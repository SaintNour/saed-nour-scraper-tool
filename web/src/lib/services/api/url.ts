/**
 * Backend routes live under `/api/...` (Express also mirrors legacy non-`/api` paths).
 *
 * Resolution order:
 * 1. `PUBLIC_API_BASE_URL` — when the API is on another origin (deployments, mobile/LAN testing
 *    with absolute URL). Use the origin only, e.g. `https://api.example.com` or `http://127.0.0.1:3000`.
 *    Do not include `/api` in the base (it is appended automatically).
 * 2. Same-origin relative `/api/...` — works with Vite `server.proxy` / `preview.proxy`, reverse proxies,
 *    and any setup where the browser’s origin can reach `/api` on the same host.
 *
 * Avoid hardcoding `localhost` in production builds: a static fallback breaks preview, LAN IPs,
 * and hosted frontends that are not served from `localhost`.
 */
export function getApiUrl(path: string): string {
	const p = path.startsWith('/') ? path : `/${path}`;
	const withApi = p.startsWith('/api') ? p : `/api${p}`;

	const raw = import.meta.env.PUBLIC_API_BASE_URL;
	if (typeof raw === 'string' && raw.trim().length > 0) {
		let base = raw.trim().replace(/\/$/, '');
		if (base.endsWith('/api')) {
			base = base.slice(0, -4);
		}
		return `${base}${withApi}`;
	}

	return withApi;
}
