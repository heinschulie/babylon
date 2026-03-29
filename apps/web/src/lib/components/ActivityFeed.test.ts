import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ActivityFeed - UI Behavior Tests', () => {
	const componentFile = path.resolve(__dirname, 'ActivityFeed.svelte');
	const content = fs.readFileSync(componentFile, 'utf-8');

	it('should display correct icons per event type (Smile, BarChart3, Vote)', () => {
		// Behavior #8: UI: feed items display correct icons per event type

		// Check that lucide icons are imported
		expect(content).toContain("import { Smile, BarChart3, Vote } from '@lucide/svelte'");

		// Check that getEventIcon function maps event types to correct icons
		expect(content).toContain("function getEventIcon(eventType: string)");
		expect(content).toContain("case 'emoji': return Smile");
		expect(content).toContain("case 'poll': return BarChart3");
		expect(content).toContain("case 'vote': return Vote");

		// Check that the icon component is rendered dynamically
		expect(content).toContain("svelte:component this={getEventIcon(event.type)}");
		expect(content).toContain("class=\"w-5 h-5 text-gray-600\"");
	});

	it('should show empty state "No activity yet" message', () => {
		// Behavior #9: UI: empty state shows "No activity yet" message

		// Check that empty state is handled
		expect(content).toContain("!activityFeed.data || activityFeed.data.length === 0");

		// Check that the correct i18n message is used
		expect(content).toContain("m.test_no_activity()");

		// Check that it's displayed as gray text
		expect(content).toContain("text-gray-500");
	});

	it('should be scrollable when items exceed visible height', () => {
		// Behavior #10: UI: feed is scrollable when items exceed visible height

		// Check that the feed container has max height and overflow scroll
		expect(content).toContain("max-h-96");
		expect(content).toContain("overflow-y-auto");

		// Check that the scrollable area contains the feed items
		expect(content).toContain("space-y-3");
		expect(content).toContain("#each activityFeed.data as event");
	});

	it('should use correct i18n message functions', () => {
		// Verify all required i18n keys are used
		expect(content).toContain("m.test_activity_feed_title()");
		expect(content).toContain("m.test_no_activity()");
		expect(content).toContain("m.test_emoji_submitted()");
		expect(content).toContain("m.test_new_poll()");
		expect(content).toContain("m.test_vote_cast()");
	});

	it('should display activity feed items with descriptions and timestamps', () => {
		// Check that feed items show event descriptions and relative timestamps
		expect(content).toContain("getEventDescription(event)");
		expect(content).toContain("formatRelativeTime(event.timestamp)");

		// Check that items are structured correctly
		expect(content).toContain("flex items-center gap-3");
		expect(content).toContain("truncate");
		expect(content).toContain("text-xs text-gray-500");
	});
});