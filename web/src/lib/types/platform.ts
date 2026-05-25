import type { Platform } from './analysis';

export type PlatformOption = {
	id: Platform;
	label: string;
	description: string;
	status: 'active' | 'coming_soon';
};

/** UI + rollout flags per network — flip `status` when a backend is ready. */
export const PLATFORM_OPTIONS: PlatformOption[] = [
	{
		id: 'youtube',
		label: 'YouTube',
		description: 'Community & comments',
		status: 'active',
	},
	{
		id: 'tiktok',
		label: 'TikTok',
		description: 'Short-form & comments',
		status: 'coming_soon',
	},
	{
		id: 'instagram',
		label: 'Instagram',
		description: 'Feed & comments',
		status: 'coming_soon',
	},
	{
		id: 'facebook',
		label: 'Facebook',
		description: 'Posts & comments',
		status: 'coming_soon',
	},
];

export function isAnalysisAvailable(platform: Platform): boolean {
	return PLATFORM_OPTIONS.some((p) => p.id === platform && p.status === 'active');
}

export function getPlatformLabel(platform: Platform): string {
	return PLATFORM_OPTIONS.find((p) => p.id === platform)?.label ?? platform;
}
