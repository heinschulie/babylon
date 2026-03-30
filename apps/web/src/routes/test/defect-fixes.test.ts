import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Review defect fixes - Badge component and formatRelativeTime', () => {
	const routeFile = path.resolve(__dirname, '+page.svelte');
	const content = fs.readFileSync(routeFile, 'utf-8');

	describe('Badge component usage for poll tags', () => {
		it('should use Badge component with variant="secondary" for poll tag badges', () => {
			// Find the tags display section
			const tagsSection = content.substring(
				content.indexOf('<!-- Tags display -->'),
				content.indexOf('{/if}', content.indexOf('<!-- Tags display -->') + 100)
			);

			// Should use Badge component with variant="secondary"
			expect(tagsSection).toContain('<Badge variant="secondary">');
			expect(tagsSection).toContain('{tag}</Badge>');
		});

		it('should NOT use raw span elements for poll tag badges', () => {
			// Find the tags display section
			const tagsSection = content.substring(
				content.indexOf('<!-- Tags display -->'),
				content.indexOf('{/if}', content.indexOf('<!-- Tags display -->') + 100)
			);

			// Should NOT contain span elements with badge-like classes
			expect(tagsSection).not.toContain('<span class=');
			expect(tagsSection).not.toContain('rounded-full');
		});

		it('should preserve clickable behavior for tag badges', () => {
			const tagsSection = content.substring(
				content.indexOf('<!-- Tags display -->'),
				content.indexOf('{/if}', content.indexOf('<!-- Tags display -->') + 100)
			);

			// Should wrap Badge in button for click handling
			expect(tagsSection).toContain('<button onclick={() => handleTagClick(tag)}>');
			expect(tagsSection).toContain('<Badge variant="secondary">{tag}</Badge>');
		});
	});

	describe('formatRelativeTime import usage', () => {
		it('should import formatRelativeTime from shared format module', () => {
			expect(content).toContain("import { formatRelativeTime } from '$lib/format'");
		});

		it('should NOT have duplicate inline formatRelativeTime function', () => {
			const scriptSection = content.substring(
				content.indexOf('<script lang="ts">'),
				content.indexOf('</script>')
			);

			// Should not have any inline function definition
			const inlineFunction = scriptSection.match(/function\s+formatRelativeTime/g);
			expect(inlineFunction).toBe(null);
		});

		it('should use formatRelativeTime for poll timestamps', () => {
			// Should format poll creation timestamps
			expect(content).toContain('formatRelativeTime(poll.createdAt)');
		});

		it('should use formatRelativeTime for sentiment timeline timestamps', () => {
			// Should format timeline entry timestamps
			expect(content).toContain('formatRelativeTime(entry.createdAt)');
		});
	});
});