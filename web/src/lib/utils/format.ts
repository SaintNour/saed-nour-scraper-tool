/** Shared number formatting for charts, tables, and stats. */
export function formatPercent(value: number): string {
	return `${Math.round(value)}%`;
}
