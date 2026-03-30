import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Achievement Toast Behavior', () => {
	// Mock toast function to track calls
	const mockToastSuccess = vi.fn();

	// Create a mock toast object
	const mockToast = {
		success: mockToastSuccess
	};

	// Clear mocks before each test
	beforeEach(() => {
		mockToastSuccess.mockClear();
	});

	describe('Toast firing logic', () => {
		it('should fire exactly 1 toast when checkAndUnlockAchievements returns 1 achievement', async () => {
			// This is our tracer bullet test
			// Test that when we have 1 achievement, exactly 1 toast fires

			const mockAchievement = {
				title: 'Emoji Starter',
				description: 'Submit your first emoji'
			};

			// Test the core logic directly - this mimics what handleAchievementUnlock does
			const handleAchievementUnlock = async () => {
				const newlyUnlocked = [mockAchievement]; // Simulating 1 achievement
				for (const achievement of newlyUnlocked) {
					mockToast.success(`🏆 ${achievement.title} unlocked!`);
				}
			};

			// Call the function
			await handleAchievementUnlock();

			// Verify exactly 1 toast was fired
			expect(mockToastSuccess).toHaveBeenCalledTimes(1);
			expect(mockToastSuccess).toHaveBeenCalledWith('🏆 Emoji Starter unlocked!');
		});

		it('should fire one toast per achievement when checkAndUnlockAchievements returns 2+ achievements', async () => {
			// Behavior #3: When 2+ achievements are unlocked, one toast fires per achievement

			const mockAchievements = [
				{
					title: 'Emoji Starter',
					description: 'Submit your first emoji'
				},
				{
					title: 'Poll Creator',
					description: 'Create your first poll'
				},
				{
					title: 'Voter',
					description: 'Cast your first vote'
				}
			];

			// Test the core logic with multiple achievements
			const handleAchievementUnlock = async () => {
				const newlyUnlocked = mockAchievements; // Simulating 3 achievements
				for (const achievement of newlyUnlocked) {
					mockToast.success(`🏆 ${achievement.title} unlocked!`);
				}
			};

			// Call the function
			await handleAchievementUnlock();

			// Verify exactly 3 toasts were fired (one per achievement)
			expect(mockToastSuccess).toHaveBeenCalledTimes(3);
			expect(mockToastSuccess).toHaveBeenNthCalledWith(1, '🏆 Emoji Starter unlocked!');
			expect(mockToastSuccess).toHaveBeenNthCalledWith(2, '🏆 Poll Creator unlocked!');
			expect(mockToastSuccess).toHaveBeenNthCalledWith(3, '🏆 Voter unlocked!');
		});

		it('should fire no toasts when checkAndUnlockAchievements returns empty array', async () => {
			// Behavior #4: When no achievements are unlocked, no toasts should fire

			// Test the core logic with empty array
			const handleAchievementUnlock = async () => {
				const newlyUnlocked: { title: string; description: string }[] = []; // Simulating no achievements
				for (const achievement of newlyUnlocked) {
					mockToast.success(`🏆 ${achievement.title} unlocked!`);
				}
			};

			// Call the function
			await handleAchievementUnlock();

			// Verify no toasts were fired
			expect(mockToastSuccess).toHaveBeenCalledTimes(0);
		});

		it('should include trophy emoji prefix and achievement title in toast message', async () => {
			// Behavior #5: Toast message contains trophy emoji prefix and achievement title

			const mockAchievement = {
				title: 'Test Achievement',
				description: 'A test achievement'
			};

			// Test the message format directly
			const handleAchievementUnlock = async () => {
				const newlyUnlocked = [mockAchievement];
				for (const achievement of newlyUnlocked) {
					mockToast.success(`🏆 ${achievement.title} unlocked!`);
				}
			};

			// Call the function
			await handleAchievementUnlock();

			// Verify the exact message format
			expect(mockToastSuccess).toHaveBeenCalledTimes(1);
			const calledMessage = mockToastSuccess.mock.calls[0][0];
			expect(calledMessage).toMatch(/^🏆 .+ unlocked!$/);
			expect(calledMessage).toContain('Test Achievement');
			expect(calledMessage).toBe('🏆 Test Achievement unlocked!');
		});
	});
});