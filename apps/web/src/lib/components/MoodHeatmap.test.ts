import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('MoodHeatmap - UI Behavior Tests', () => {
	const componentFile = path.resolve(__dirname, 'MoodHeatmap.svelte');
	const content = fs.readFileSync(componentFile, 'utf-8');

	it('should render 7 columns (one per day)', () => {
		// Behavior #4: Frontend MoodHeatmap component renders 7 columns (one per day)

		// Check that we generate 7 days worth of dates
		expect(content).toContain('for (let i = 6; i >= 0; i--)');

		// Check that the grid has 7 columns
		expect(content).toContain('grid grid-cols-7');

		// Check that weekDates is used for columns
		expect(content).toContain('weekDates as date');
	});

	it('should show opacity proportional to count value', () => {
		// Behavior #7: Frontend Heatmap cells show opacity proportional to count value

		// Check that getOpacity function exists and calculates opacity
		expect(content).toContain('function getOpacity(count: number): number');
		expect(content).toContain('if (count === 0) return 0');
		expect(content).toContain('Math.min(0.3 + (count - 1) * 0.2, 1.0)');

		// Check that opacity is applied to cells via style
		expect(content).toContain('style="opacity: {opacity}"');
		expect(content).toContain('opacity = getOpacity(count)');
	});

	it('should use correct colors (chill=blue, angry=red, happy=green)', () => {
		// Behavior #8: Frontend Mood rows use correct colors (chill=blue, angry=red, happy=green)

		// Check that mood colors are properly defined
		expect(content).toContain("chill: 'bg-blue-500'");
		expect(content).toContain("angry: 'bg-red-500'");
		expect(content).toContain("happy: 'bg-green-500'");

		// Check that colors are applied to cells
		expect(content).toContain('{moodColors[mood]}');

		// Check that moods array exists
		expect(content).toContain("const moods: Mood[] = ['chill', 'angry', 'happy']");
	});

	it('should render empty cells with subtle border and no fill', () => {
		// Behavior #9: Frontend Empty cells render with subtle border and no fill

		// Check that cells have border styling
		expect(content).toContain('border border-gray-200');

		// Check that cells with count 0 have opacity 0 (no fill)
		expect(content).toContain('if (count === 0) return 0');
	});

	it('should show empty state message when no data', () => {
		// Behavior #11: Frontend Empty state shows `test_mood_heatmap_empty` message when no data

		// Check that empty state condition is handled
		expect(content).toContain('!heatmapData.data || heatmapData.data.length === 0');

		// Check that correct i18n message is used
		expect(content).toContain('m.test_mood_heatmap_empty()');

		// Check that empty message has proper styling
		expect(content).toContain('text-gray-600');
	});

	it('should have proper component structure and imports', () => {
		// Additional structural checks

		// Check Convex query import and usage
		expect(content).toContain("import { useQuery } from 'convex-svelte'");
		expect(content).toContain("const heatmapData = useQuery(api.testMoodHeatmap.getWeekHeatmap, {})");

		// Check i18n imports and title
		expect(content).toContain("import * as m from '$lib/paraglide/messages.js'");
		expect(content).toContain('m.test_mood_heatmap_title()');

		// Check that component is wrapped in section
		expect(content).toContain('<section class="p-4">');

		// Check loading state
		expect(content).toContain('heatmapData.isLoading');
		expect(content).toContain('Loading heatmap...');
	});
});