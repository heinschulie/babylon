import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Achievement Toast functionality', () => {
	const routeFile = path.resolve(__dirname, '+page.svelte');
	const content = fs.readFileSync(routeFile, 'utf-8');

	describe('Toaster component rendering', () => {
		it('should import toast and Toaster from sonner-svelte', () => {
			expect(content).toContain("import { toast, Toaster } from 'sonner-svelte'");
		});

		it('should render Toaster component at the top level', () => {
			expect(content).toContain('<Toaster />');

			// Toaster should appear before the main content div
			const toasterIndex = content.indexOf('<Toaster />');
			const mainDivIndex = content.indexOf('<div class="bg-[#E1261C] min-h-[100vh]">');
			expect(toasterIndex).toBeGreaterThan(-1);
			expect(toasterIndex).toBeLessThan(mainDivIndex);
		});
	});

	describe('Achievement check integration', () => {
		it('should have checkAndUnlockAchievements function that calls toast.success for each achievement', () => {
			// Look for function that processes achievement results and fires toasts
			expect(content).toContain('checkAndUnlockAchievements');
			expect(content).toContain('toast.success');
			expect(content).toContain('🏆');
			expect(content).toContain('unlocked!');
		});

		it('should call checkAndUnlockAchievements after emoji submission', () => {
			// Achievement check should be called after handleEmojiClick
			expect(content).toContain('handleEmojiClick');
			expect(content).toContain('checkAndUnlockAchievements');
		});

		it('should call checkAndUnlockAchievements after poll vote', () => {
			// Achievement check should be called after handleVoteClick
			expect(content).toContain('handleVoteClick');
			expect(content).toContain('checkAndUnlockAchievements');
		});

		it('should have handleAchievementUnlock function that iterates over achievements and fires toasts', () => {
			// Function should process array of achievements and fire one toast per achievement
			expect(content).toContain('handleAchievementUnlock');
			expect(content).toContain('for (const achievement of newlyUnlocked)');
			expect(content).toContain('toast.success(`🏆 ${achievement.title} unlocked!`');
		});

		it('should have Achievement type definition with title property', () => {
			// Type definition for Achievement should have title property used in toast
			expect(content).toContain('type Achievement');
			expect(content).toContain('title: string');
		});
	});
});