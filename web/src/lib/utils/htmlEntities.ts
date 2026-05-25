/** Decode common HTML entities from API text (titles, summaries). */
export function decodeHtmlEntities(input: string): string {
	if (typeof input !== 'string' || !input) return input;
	let s = input
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0*39;/g, "'")
		.replace(/&#x0*27;/gi, "'")
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, ' ');
	s = s.replace(/&#(\d+);/g, (m, n) => {
		const code = Number(n);
		return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
	});
	s = s.replace(/&#x([0-9a-fA-F]+);/g, (m, h) => {
		const code = parseInt(h, 16);
		return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
	});
	return s;
}
