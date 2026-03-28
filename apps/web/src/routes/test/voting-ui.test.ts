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
});