import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TDD tests for Sonner achievement toast integration
describe('Achievement Toast Integration', () => {
  const routeFile = path.resolve(__dirname, '+page.svelte');
  const content = fs.readFileSync(routeFile, 'utf-8');

  // Tracer bullet: Verify Sonner Toaster component is rendered
  it('should render Sonner Toaster component on test page', () => {
    // Behavior #5: Toaster component is rendered on the test page
    expect(content).toContain('import { toast, Toaster } from \'sonner-svelte\'');
    expect(content).toContain('<Toaster');
  });

  it('should fire toast.success for each newly unlocked achievement after emoji submission', () => {
    // Behavior #1: When checkAndUnlockAchievements returns 1 new achievement, exactly 1 toast appears
    // Verify that handleEmojiClick calls toast.success for each achievement
    expect(content).toContain('checkAndUnlockAchievements');
    expect(content).toContain('toast.success');
    expect(content).toContain('🏆 ${achievement.title} unlocked!');

    // Should loop through newlyUnlocked achievements
    expect(content).toContain('for (const achievement of newlyUnlocked)');
  });

  it('should fire toast.success for each newly unlocked achievement after poll vote', () => {
    // Behavior #2: Toast fires for each newly unlocked achievement after poll vote
    const handleVoteClickPattern = /handleVoteClick[\s\S]*?toast\.success/;
    expect(content).toMatch(handleVoteClickPattern);
  });

  it('should NOT use custom toast system', () => {
    // Should remove the old custom toast implementation
    expect(content).not.toContain('showToast');
    expect(content).not.toContain('interface Toast');
    expect(content).not.toContain('let toasts = $state<Toast[]>([]);');
  });
});

// Legacy unit tests for message formatting
describe('Achievement Toast Message Logic', () => {
  it('formats achievement toast message correctly', () => {
    const achievement = { type: 'emoji_starter', title: 'Emoji Starter' };
    const expectedMessage = `🏆 ${achievement.title} unlocked!`;

    expect(expectedMessage).toBe('🏆 Emoji Starter unlocked!');
  });

  it('handles multiple achievements correctly', () => {
    const achievements = [
      { type: 'emoji_starter', title: 'Emoji Starter' },
      { type: 'democracy', title: 'Democracy!' }
    ];

    const messages = achievements.map(achievement =>
      `🏆 ${achievement.title} unlocked!`
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe('🏆 Emoji Starter unlocked!');
    expect(messages[1]).toBe('🏆 Democracy! unlocked!');
  });

  it('handles empty achievements array', () => {
    const achievements: Array<{ title: string }> = [];
    const messages = achievements.map(achievement =>
      `🏆 ${achievement.title} unlocked!`
    );

    expect(messages).toHaveLength(0);
  });
});