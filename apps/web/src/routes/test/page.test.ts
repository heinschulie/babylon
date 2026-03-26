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

	it('should NOT import Button component from @babylon/ui/button', () => {
		expect(content).not.toContain("import { Button } from '@babylon/ui/button'");
	});


	it('should NOT have any shadcn Button component markup', () => {
		expect(content).not.toContain('<Button');
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
			expect(content).toContain('useConvexMutation');
			expect(content).toContain('api.testEmojiMutation.submitEmoji');
		});

		it('should have handleEmojiClick function that closes dialog', () => {
			expect(content).toContain('handleEmojiClick');
			expect(content).toContain('dialogOpen = false');
		});
	});
});
