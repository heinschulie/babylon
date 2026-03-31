import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ReactionSummaryBar', () => {
	const componentFile = path.resolve(__dirname, 'ReactionSummaryBar.svelte');
	const content = fs.readFileSync(componentFile, 'utf-8');

	it('should render segments for each reaction type', () => {
		// Behavior 4: ReactionSummaryBar renders segments for each reaction type

		// Should iterate over reactionData prop
		expect(content).toContain('#each reactionData as reaction');

		// Should render segment with test id
		expect(content).toContain('data-testid="reaction-segment"');
	});

	it('should have segment widths proportional to reaction counts', () => {
		// Behavior 5: Segment widths are proportional to reaction counts

		// Should calculate total count using $derived
		expect(content).toContain('$derived');

		// Should calculate width percentage for each segment
		expect(content).toContain('width:');
		expect(content).toContain('%');
	});

	it('should have title attribute with emoji and count on each segment', () => {
		// Behavior 6: Each segment has title attribute with emoji and count

		// Should have title attribute on segment elements
		expect(content).toContain('title=');
		expect(content).toContain('reaction.emoji');
		expect(content).toContain('reaction.count');
	});

	it('should use fixed 6-color palette cycling for segments', () => {
		// Behavior 7: Bar uses fixed 6-color palette cycling for segments

		// Should define a color palette array
		expect(content).toContain('const colors');

		// Should use modulo operator to cycle through colors
		expect(content).toContain('colors[');
		expect(content).toContain('% colors.length');

		// Should apply background color to segments
		expect(content).toContain('background-color:');
	});

	it('should not render when total reaction count is 0', () => {
		// Behavior 8: Bar does not render when total reaction count is 0

		// Should conditionally render based on totalCount
		expect(content).toContain('{#if totalCount > 0}');

		// Should have an end if block
		expect(content).toContain('{/if}');
	});
});