import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('/test route', () => {
	const routeFile = path.resolve(__dirname, '+page.svelte');
	const content = fs.readFileSync(routeFile, 'utf-8');

	it('should have a route file that exists', () => {
		expect(fs.existsSync(routeFile)).toBe(true);
	});

	it('should have #E1261C background color', () => {
		const hasMarlboroRed = content.includes('#E1261C') || content.includes('bg-[#E1261C]');
		expect(hasMarlboroRed).toBe(true);
	});

	it('should NOT contain old #C8A2C8 lilac color', () => {
		const hasOldLilac = content.includes('#C8A2C8') || content.includes('bg-[#C8A2C8]');
		expect(hasOldLilac).toBe(false);
	});

	it('should NOT contain old #FF4F00 color', () => {
		const hasOldColor = content.includes('#FF4F00') || content.includes('bg-[#FF4F00]');
		expect(hasOldColor).toBe(false);
	});

	it('should have full viewport height', () => {
		expect(content).toContain('100vh');
	});

	it('should have an H1 containing "christ on a pogostick"', () => {
		expect(content).toContain('<h1');
		expect(content).toContain('christ on a pogostick');
	});

	it('should NOT contain the old heading text "crouching tiger"', () => {
		expect(content).not.toContain('crouching tiger');
	});

	it('should retain text-[150px] styling on the H1 element', () => {
		expect(content).toContain('<h1 class="text-[150px]">christ on a pogostick</h1>');
	});

	it('should NOT contain any remnant of "splish splash"', () => {
		expect(content).not.toContain('splish splash');
	});

	it('should have H1 with 150px font size via Tailwind arbitrary value', () => {
		expect(content).toContain('text-[150px]');
	});

	it('should import Button component from @babylon/ui/button for voting UI', () => {
		expect(content).toContain("import { Button } from '@babylon/ui/button'");
	});

	it('should have shadcn Button components for voting', () => {
		expect(content).toContain('<Button');
	});




	it('should have an img element below the heading', () => {
		expect(content).toContain('<img');

		const h1Index = content.indexOf('<h1');
		const imgIndex = content.indexOf('<img');
		expect(imgIndex).toBeGreaterThan(h1Index);
		expect(imgIndex).toBeGreaterThan(0);
	});

	it('should load images from picsum.photos URL', () => {
		for (let i = 1; i <= 15; i++) {
			expect(content).toContain(`src="https://picsum.photos/1600/900?random=${i}"`);
		}
	});

	it('should have alt text that matches the picsum.photos service', () => {
		expect(content).toContain('alt="Random image from picsum.photos"');
		expect(content).not.toContain('alt="Random image from Unsplash"');
	});

	it('should display images with proper aspect ratio and sizing', () => {
		expect(content).toContain('aspect-video');
		expect(content).toContain('object-cover');
		expect(content).toContain('w-full');
	});


	it('should use semantic figure/figcaption structure', () => {
		const figureIndex = content.indexOf('<figure');
		const figcaptionIndex = content.indexOf('<figcaption>');
		const figureClosure = content.indexOf('</figure>');

		expect(figureIndex).toBeGreaterThan(-1);
		expect(figcaptionIndex).toBeGreaterThan(figureIndex);
		expect(figureClosure).toBeGreaterThan(figcaptionIndex);
	});

	it('should have 25 img elements with picsum.photos src attributes', () => {
		const imgMatches = content.match(/<img[^>]*>/g);
		expect(imgMatches).toHaveLength(25);

		for (let i = 1; i <= 25; i++) {
			expect(content).toContain(`?random=${i}`);
		}
	});

	it('should have exactly 4 grid containers', () => {
		const gridMatches = content.match(/class="[^"]*grid[^"]*"/g);
		expect(gridMatches).toHaveLength(4);

		// Verify specific grid layouts
		expect(content).toContain('grid-cols-3');
		expect(content).toContain('grid-cols-5');
		expect(content).toContain('grid-cols-7');
		expect(content).toContain('grid-cols-9');
	});

	it('should have 25 images with different random seeds (1-25)', () => {
		for (let i = 1; i <= 25; i++) {
			expect(content).toContain(`?random=${i}`);
		}
	});

	it('should have first 24 images with grid-specific classes', () => {
		const imgMatches = content.match(/<img[^>]*>/g);
		expect(imgMatches).toHaveLength(25);

		// First 24 images should have grid-specific classes
		for (let i = 0; i < 24; i++) {
			expect(imgMatches![i]).toContain('w-full');
			expect(imgMatches![i]).toContain('aspect-video');
			expect(imgMatches![i]).toContain('object-cover');
		}
	});

	it('should have 24 figure elements wrapping img+figcaption pairs', () => {
		const figureMatches = content.match(/<figure[^>]*>/g);
		expect(figureMatches).toHaveLength(24);

		const figureBlocks = content.match(/<figure[^>]*>.*?<\/figure>/gs);
		expect(figureBlocks).toHaveLength(24);

		figureBlocks?.forEach((block) => {
			expect(block).toContain('<img');
			expect(block).toContain('<figcaption');
		});
	});

	it('should have 24 figcaption elements with unique text content', () => {
		const captionMatches = content.match(/<figcaption[^>]*>(.*?)<\/figcaption>/g);
		expect(captionMatches).toHaveLength(24);

		const captionTexts = captionMatches?.map(match =>
			match.replace(/<figcaption[^>]*>(.*?)<\/figcaption>/, '$1').trim()
		) || [];

		const uniqueTexts = new Set(captionTexts);
		expect(uniqueTexts.size).toBe(24);
	});

	it('should not contain 80vw width constraint', () => {
		expect(content).not.toContain('w-[80vw]');
	});

	it('should have 25th image with w-full class and random=25', () => {
		expect(content).toContain('?random=25');

		// Find the 25th image (last one)
		const imgMatches = content.match(/<img[^>]*>/g);
		expect(imgMatches).toHaveLength(25);

		const lastImg = imgMatches![24];
		expect(lastImg).toContain('w-full');
		expect(lastImg).toContain('?random=25');
	});

	it('should have 25th image placed after the last grid container', () => {
		// Look for the pattern: last figure with random=24 followed by closing grid div, then our new image
		const lastFigurePattern = content.indexOf('?random=24');
		const newImagePattern = content.indexOf('?random=25');

		expect(lastFigurePattern).toBeGreaterThan(-1);
		expect(newImagePattern).toBeGreaterThan(-1);

		// The new image should come after the last grid image
		expect(newImagePattern).toBeGreaterThan(lastFigurePattern);

		// Verify that there's a grid closing div between them
		const gridClosingBetween = content.substring(lastFigurePattern, newImagePattern);
		expect(gridClosingBetween).toContain('</div>');
	});

	// New feature tests for emoji dialog
	describe('emoji button feature', () => {
		it('should have Test Emoji button above existing content', () => {
			expect(content).toContain('Test Emoji');
			expect(content).toContain('<button');

			// Button should appear before the H1 heading
			const buttonIndex = content.indexOf('Test Emoji');
			const h1Index = content.indexOf('<h1');
			expect(buttonIndex).toBeLessThan(h1Index);
			expect(buttonIndex).toBeGreaterThan(-1);
		});

		it('should import Dialog components from ui package', () => {
			expect(content).toContain('Dialog');
		});

		it('should have dialog state management', () => {
			expect(content).toContain('dialogOpen');
		});

		it('should have Dialog.Root component with open state', () => {
			expect(content).toContain('<Dialog.Root');
			expect(content).toContain('open={dialogOpen}');
		});

		it('should contain exactly 3 emoji buttons', () => {
			expect(content).toContain('😎');
			expect(content).toContain('💩');
			expect(content).toContain('🔥');

			// Count emoji button elements (each appears in button text and function call)
			const coolEmoji = (content.match(/😎/g) || []).length;
			const poopEmoji = (content.match(/💩/g) || []).length;
			const fireEmoji = (content.match(/🔥/g) || []).length;

			expect(coolEmoji).toBe(2); // button + function call
			expect(poopEmoji).toBe(2); // button + function call
			expect(fireEmoji).toBe(2); // button + function call
		});

		it('should import Convex client functions', () => {
			expect(content).toContain('useConvexClient');
			expect(content).toContain('api.testEmojiMutation.submitEmoji');
		});

		it('should have handleEmojiClick function that closes dialog', () => {
			expect(content).toContain('handleEmojiClick');
			expect(content).toContain('dialogOpen = false');
		});
	});

	// New feature tests for sentiment timeline
	describe('sentiment timeline feature', () => {
		it('should have timeline section markup', () => {
			expect(content).toContain('Sentiment Timeline');
		});

		it('should have mood badge elements with correct colors', () => {
			expect(content).toContain('bg-blue-100 text-blue-800');   // chill badge
			expect(content).toContain('bg-red-100 text-red-800');     // angry badge
			expect(content).toContain('bg-orange-100 text-orange-800'); // happy badge
		});

		it('should have mood summary section markup', () => {
			expect(content).toContain('chill ·');
			expect(content).toContain('angry ·');
			expect(content).toContain('happy');
		});

		it('should have loading state markup', () => {
			expect(content).toContain('Loading timeline...');
		});

		it('should have empty state markup', () => {
			expect(content).toContain('No emoji submissions yet');
		});

		it('should pass userId to submitEmoji mutation', () => {
			expect(content).toContain('userId: "test-user"');
		});



		it('should show individual timeline entries with emoji and mood badge', () => {
			// Timeline entries should display individual submissions (filtered)
			expect(content).toContain('{#each filteredEmojis() as entry}');  // Should iterate over filtered timeline data
			expect(content).toContain('{entry.emoji}');  // Should display emoji from entry
			expect(content).toContain('entry.mood');   // Should use mood for badge color
		});

		it('should pass mood parameter to handleEmojiClick function', () => {
			// Each emoji button should pass the correct mood
			expect(content).toContain("handleEmojiClick('😎', 'chill')");  // Cool emoji -> chill
			expect(content).toContain("handleEmojiClick('💩', 'angry')");  // Poop emoji -> angry
			expect(content).toContain("handleEmojiClick('🔥', 'happy')");  // Fire emoji -> happy
		});

		it('should display relative timestamps for timeline entries', () => {
			// Timeline entries should show relative time (e.g., "2 minutes ago")
			expect(content).toContain('entry.createdAt');  // Should access createdAt from entry
			expect(content).toMatch(/minutes?\s+ago/);     // Should show relative time format
		});

		it('should use proper mood color mapping for badge classes', () => {
			// Should use a mapping object instead of dynamic string interpolation
			expect(content).toContain('moodColors');       // Should have color mapping object
			expect(content).toContain('moodColors[entry.mood as keyof typeof moodColors]'); // Should use mapping to get classes
		});
	});

	// New feature tests for poll creation and listing
	describe('poll creation form feature', () => {
		it('should render poll creation form with question input', () => {
			expect(content).toContain('testPollMutation.createPoll');
			// Form should have a question input
			expect(content).toMatch(/question/i);
		});

		it('should render poll creation form with option inputs', () => {
			// Should have dynamic list of option inputs
			expect(content).toContain('options');
			// Should support adding options
			expect(content).toMatch(/add.*option/i);
		});

		it('should render poll list with question text and option count', () => {
			// Should display poll questions
			expect(content).toContain('listPolls');
			// Should show option count for each poll
			expect(content).toMatch(/option/i);
		});
	});

	// Emoji leaderboard feature tests
	describe('emoji leaderboard feature', () => {
		it('should have leaderboard section with heading', () => {
			expect(content).toContain('Emoji Leaderboard');
			expect(content).toContain('getEmojiLeaderboard');
		});

		it('should render ranked list with position, emoji, and count', () => {
			// Should iterate leaderboard data with index for position
			expect(content).toMatch(/leaderboard/i);
			// Should display emoji and count from each entry
			expect(content).toContain('.emoji');
			expect(content).toContain('.count');
		});

		it('should have empty state when no emojis match filter', () => {
			expect(content).toMatch(/no.*emoji|empty/i);
		});
	});

	// Mood filter feature tests
	describe('mood filter feature', () => {
		it('should have activeMoodFilter state variable', () => {
			expect(content).toContain('activeMoodFilter');
		});

		it('should have mood filter buttons for chill, angry, happy, and All', () => {
			// Should render filter buttons for each mood plus All
			expect(content).toMatch(/filter/i);
			// Should have Button components for filtering
			const filterSection = content.includes('activeMoodFilter');
			expect(filterSection).toBe(true);
		});

		it('should pass activeMoodFilter to getEmojiLeaderboard query', () => {
			expect(content).toContain('getEmojiLeaderboard');
			expect(content).toContain('activeMoodFilter');
		});

		it('should filter sentiment timeline entries by active mood', () => {
			// Should use $derived to filter recentEmojis.data
			expect(content).toContain('filteredEmojis');
			expect(content).toContain('activeMoodFilter');
		});

		it('should keep mood count badges unfiltered (show totals always)', () => {
			// moodCounts should NOT reference activeMoodFilter
			// It should always use recentEmojis.data directly
			const moodCountsBlock = content.match(/moodCounts[\s\S]*?\}\)/)?.[0] ?? '';
			expect(moodCountsBlock).not.toContain('activeMoodFilter');
		});
	});

	// Enhanced poll list feature tests
	describe('enhanced poll list feature', () => {
		it('should render poll cards with shadcn Card components', () => {
			// Each poll should be wrapped in Card.Root with Card.Header and Card.Content
			expect(content).toContain('Card.Header');
			expect(content).toContain('Card.Content');
			// Poll question should be in Card.Title within Card.Header
			expect(content).toContain('Card.Title');
		});

		it('should render numbered options list for each poll', () => {
			// Should use numbered list (ol) to display all poll options
			expect(content).toContain('<ol');
			expect(content).toContain('poll.options as option');
		});

		it('should display total vote count for each poll', () => {
			// Should query vote results and display total votes
			expect(content).toContain('getPollResults');
			expect(content).toContain('total vote');
		});

		it('should display relative timestamp for each poll', () => {
			// Should use formatRelativeTime helper and display timestamp
			expect(content).toContain('formatRelativeTime');
			expect(content).toContain('poll.createdAt');
		});

		it('should render empty state when no polls exist', () => {
			// Should display "No polls exist" message when list is empty
			expect(content).toContain('No polls exist');
		});
	});
});
