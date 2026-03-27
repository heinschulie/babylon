import { v } from 'convex/values';
import { mutation } from './_generated/server';

const EMOJI_CONFIG: Record<string, { sentence: string; mood: string }> = {
	'😎': { sentence: 'The cat wore sunglasses to the job interview', mood: 'chill' },
	'💩': { sentence: 'Someone left a flaming bag on the porch again', mood: 'angry' },
	'🔥': { sentence: 'The server room is fine, everything is fine', mood: 'happy' },
};

const VALID_EMOJIS = Object.keys(EMOJI_CONFIG);

export const submitEmoji = mutation({
	args: {
		emoji: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, { emoji, userId }) => {
		const config = EMOJI_CONFIG[emoji];
		if (!config) {
			throw new Error(`Invalid emoji: ${emoji}. Must be one of: ${VALID_EMOJIS.join(', ')}`);
		}

		return ctx.db.insert('testTable', {
			emoji,
			...config,
			userId,
			createdAt: Date.now(),
		});
	},
});