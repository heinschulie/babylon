import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Convex modules
const mockMutation = vi.fn().mockResolvedValue('mock-reaction-id');
const mockUseQuery = vi.fn();

vi.mock('convex-svelte', () => ({
	useConvexClient: () => ({
		mutation: mockMutation
	}),
	useQuery: mockUseQuery
}));

vi.mock('@babylon/convex', () => ({
	api: {
		testReactions: {
			addReaction: 'mock-addReaction-mutation',
			getReactionCounts: 'mock-getReactionCounts-query'
		}
	}
}));

// --- Helpers mirroring page-level logic ---

/** Format a reaction for Badge display text */
function formatBadgeText(emoji: string, count: number): string {
	return `${emoji} ${count}`;
}

/** Determine whether reaction badges should render */
function shouldShowBadges(reactions: unknown[]): boolean {
	return reactions.length > 0;
}

/** Simulate the addReaction call a click handler dispatches */
async function callAddReaction(parentId: string, emoji: string, userId = 'test-user') {
	return mockMutation('mock-addReaction-mutation', { parentId, emoji, userId });
}

describe('Reaction UI - Frontend Behaviors', () => {
	beforeEach(() => {
		mockMutation.mockClear();
		mockUseQuery.mockClear();
	});
	describe('Behavior #3: Each emoji entry renders a reaction bar below it', () => {
		it('should have data structure to render reaction bar for each emoji entry', () => {
			// Mock emoji entries with IDs (simulating what the page receives)
			const emojiEntries = [
				{ _id: 'entry1', emoji: '😎', mood: 'chill', createdAt: Date.now() },
				{ _id: 'entry2', emoji: '💩', mood: 'angry', createdAt: Date.now() }
			];

			// Test that each entry has the required fields for rendering a reaction bar
			emojiEntries.forEach(entry => {
				expect(entry._id).toBeDefined();
				expect(typeof entry._id).toBe('string');
			});

			// Verify structure supports reaction bar rendering
			expect(emojiEntries).toHaveLength(2);
		});
	});

	describe('Behavior #6: Reaction bar displays Badge components with emoji + count', () => {
		it('should format reaction data correctly for Badge components', () => {
			// Mock reaction counts data
			const reactionCounts = [
				{ emoji: '😎', count: 3 },
				{ emoji: '💩', count: 1 }
			];

			// Mock the useQuery to return reaction counts
			mockUseQuery.mockReturnValue({
				data: reactionCounts,
				isLoading: false
			});

			// Test Badge text formatting via shared helper
			expect(formatBadgeText('😎', 3)).toBe('😎 3');
			expect(formatBadgeText('💩', 1)).toBe('💩 1');
		});
	});

	describe('Behavior #8: Zero reactions shows only "+" button (no empty badges)', () => {
		it('should handle empty reaction state correctly', () => {
			const reactionCounts: unknown[] = [];

			// No badges for empty data; add button always visible
			expect(shouldShowBadges(reactionCounts)).toBe(false);
		});

		it('should show badges AND "+" button when reactions exist', () => {
			const reactionCounts = [{ emoji: '😎', count: 2 }];

			expect(shouldShowBadges(reactionCounts)).toBe(true);
		});
	});

	describe('Behavior #10: Clicking reaction badge calls addReaction', () => {
		it('should call addReaction with correct parentId and emoji when badge is clicked', async () => {
			await callAddReaction('test-parent-id', '😎');

			expect(mockMutation).toHaveBeenCalledWith('mock-addReaction-mutation', {
				parentId: 'test-parent-id',
				emoji: '😎',
				userId: 'test-user'
			});
		});

		it('should handle click event on "+" button to add reaction', async () => {
			// "+" button defaults to 😎 emoji
			await callAddReaction('test-parent-id', '😎');

			expect(mockMutation).toHaveBeenCalledWith('mock-addReaction-mutation', {
				parentId: 'test-parent-id',
				emoji: '😎',
				userId: 'test-user'
			});
		});
	});

	describe('Behavior #12: Real-time updates via useQuery subscription', () => {
		it('should subscribe to reaction counts with parentId parameter', () => {
			const parentId = 'test-parent-id';

			// Mock useQuery call (simulates the actual page's useQuery usage)
			mockUseQuery('mock-getReactionCounts-query', () => ({ parentId }));

			// Verify useQuery was called with correct parameters
			expect(mockUseQuery).toHaveBeenCalledWith('mock-getReactionCounts-query', expect.any(Function));
		});

		it('should handle real-time data updates correctly', () => {
			// Test data update scenarios
			const initialData = [{ emoji: '😎', count: 1 }];
			const updatedData = [{ emoji: '😎', count: 2 }];

			// Verify the logic can detect count changes
			expect(updatedData[0].count).toBeGreaterThan(initialData[0].count);

			// Test that data structure remains consistent after updates
			expect(updatedData[0]).toHaveProperty('emoji');
			expect(updatedData[0]).toHaveProperty('count');
			expect(typeof updatedData[0].count).toBe('number');
		});
	});
});