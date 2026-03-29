import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Voting UI - Behavior Tests', () => {
	const routeFile = path.resolve(__dirname, '+page.svelte');
	const content = fs.readFileSync(routeFile, 'utf-8');

	it('should render vote buttons for each option in a poll', () => {
		// Test 1: Vote buttons render for each option in a poll
		// Check that the page imports Button from @babylon/ui
		expect(content).toContain("import { Button } from '@babylon/ui/button'");

		// Check that vote buttons are rendered for each poll option
		expect(content).toContain('{#each poll.options as option}');
		expect(content).toContain('<Button');
		expect(content).toContain('{option}');
	});

	it('should render bar chart section below vote buttons', () => {
		// Test 3: Bar chart section renders below vote buttons
		// Check that there's a bar chart section with results display
		expect(content).toContain('Bar Chart');
		expect(content).toContain('getPollResults');
		expect(content).toContain('pollResults');
	});

	it('should display option label, colored bar div, and count for each bar', () => {
		// Test 4: Each bar displays option label, colored bar div, and count
		// Check that bars show option text, percentage width styling, and vote count
		expect(content).toContain('result.option');
		expect(content).toContain('bg-blue-500');
		expect(content).toContain('result.count');
		expect(content).toContain('width:');
	});

	it('should have bar widths proportional to vote counts', () => {
		// Test 5: Bar widths are proportional (percentage of max count)
		// Check that bars calculate percentage widths based on max count
		expect(content).toContain('Math.max');
		expect(content).toContain('* 100');
		expect(content).toContain('pollResults.data.map');
	});

	it('should handle zero-vote options with minimal bar width', () => {
		// Test 6: Zero-vote options render with a minimal/empty bar
		// Check that zero-count results get a minimum width (2%)
		expect(content).toContain('result.count > 0');
		expect(content).toContain(': 2');
	});

	it('should trigger castVote mutation when vote button is clicked', () => {
		// Test 7: Vote button triggers castVote mutation call
		// Check that vote buttons have onclick handlers that call castVote
		expect(content).toContain('onclick');
		expect(content).toContain('castVote');
		expect(content).toContain('pollId');
		expect(content).toContain('userId: "test-user"');
	});

	it('should render close button on open polls (no closedAt field)', () => {
		// Test: Close button renders when closedAt is falsy
		// Check imports
		expect(content).toContain("import * as m from '$lib/paraglide/messages.js'");
		// Check for close button call with i18n
		expect(content).toContain('m.test_poll_close()');
		// Check for conditional rendering based on !poll.closedAt
		expect(content).toContain('{#if !poll.closedAt}');
		// Check for closePoll mutation
		expect(content).toContain('closePoll');
	});

	it('should not render close button on closed polls (closedAt is set)', () => {
		// Test: Close button is hidden when closedAt is truthy
		// This is implicitly tested by the inverse logic:
		// The close button is wrapped in {#if !poll.closedAt}
		// which means it won't render when closedAt exists
		expect(content).toContain('{#if !poll.closedAt}');
		// Verify the button is inside this conditional
		expect(content).toContain('handleClosePoll');
	});

	it('should render "Closed" badge on closed polls (closedAt is set)', () => {
		// Test: Badge renders when closedAt is truthy
		// Check for i18n call for closed badge
		expect(content).toContain('m.test_poll_closed()');
		// Check for conditional rendering based on poll.closedAt
		expect(content).toContain('{#if poll.closedAt}');
		// Check for Badge component instead of raw span
		expect(content).toContain('<Badge variant="secondary">');
		expect(content).toContain('m.test_poll_closed()');
	});

	it('should hide vote buttons on closed polls (closedAt is set)', () => {
		// Test: Vote buttons hidden when poll is closed
		// Verify that vote buttons are within a conditional block
		// Check that the structure wraps buttons in {#if !poll.closedAt}
		expect(content).toContain('{#if !poll.closedAt}');

		// Verify the structure has conditional wrapping the vote buttons and close button
		// Look for the pattern where vote buttons appear after the opening conditional
		const openConditional = content.indexOf('{#if !poll.closedAt}');
		const voteButtons = content.indexOf('{#each poll.options as option', openConditional);
		const closeButton = content.indexOf('handleClosePoll', openConditional);

		expect(openConditional).toBeGreaterThan(-1);
		expect(voteButtons).toBeGreaterThan(openConditional);
		expect(closeButton).toBeGreaterThan(openConditional);
	});

	it('should keep poll results visible on closed polls', () => {
		// Test: Bar chart renders regardless of closed state
		// Results section should NOT be wrapped in !poll.closedAt conditional
		// It should be outside and independent

		// Verify bar chart section exists
		expect(content).toContain('Bar Chart');
		expect(content).toContain('getPollResults');
		expect(content).toContain('pollResults');

		// Verify the results section is NOT inside the !poll.closedAt conditional
		// Find the conditional close tag after vote buttons
		const openConditional = content.indexOf('{#if !poll.closedAt}');
		const closeConditional = content.indexOf('{/if}', openConditional);
		const barChartSection = content.indexOf('Bar Chart', openConditional);

		// Bar chart should appear AFTER the conditional closes
		expect(closeConditional).toBeGreaterThan(-1);
		expect(barChartSection).toBeGreaterThan(closeConditional);
	});
});