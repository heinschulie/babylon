import { v } from 'convex/values';
import { mutation } from './_generated/server';

const EMOJI_SENTENCES = {
	'😎': 'The cat wore sunglasses to the job interview',
	'💩': 'Someone left a flaming bag on the porch again',
	'🔥': 'The server room is fine, everything is fine'
} as const;

export const submitEmoji = mutation({
	args: { emoji: v.string() },
	handler: async (ctx, args) => {
		const { emoji } = args;

		// Validate emoji is one of the allowed values
		if (!Object.keys(EMOJI_SENTENCES).includes(emoji)) {
			throw new Error(`Invalid emoji: ${emoji}. Must be one of: 😎, 💩, 🔥`);
		}

		// Get the mapped sentence
		const sentence = EMOJI_SENTENCES[emoji as keyof typeof EMOJI_SENTENCES];

		// Insert record into testTable
		const id = await ctx.db.insert('testTable', {
			emoji,
			sentence,
			createdAt: Date.now()
		});

		return id;
	}
});