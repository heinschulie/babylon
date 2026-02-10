export type PhraseCategory = {
	key: string;
	label: string;
	keywords: string[];
};

export const PHRASE_CATEGORIES: readonly PhraseCategory[] = [
	{
		key: 'introductions',
		label: 'Introductions & Meeting People',
		keywords: ['name', 'hello', 'hi', 'meet', 'nice to meet', 'from', 'introduce', 'who are you']
	},
	{
		key: 'directions_navigation',
		label: 'Directions & Finding Places',
		keywords: ['where', 'left', 'right', 'street', 'road', 'map', 'near', 'far', 'turn']
	},
	{
		key: 'daily_basics',
		label: 'Daily Basics',
		keywords: ['today', 'tomorrow', 'yesterday', 'morning', 'night', 'home', 'work', 'sleep']
	},
	{
		key: 'food_drink',
		label: 'Food & Drink',
		keywords: ['food', 'eat', 'drink', 'water', 'tea', 'coffee', 'hungry', 'restaurant', 'menu']
	},
	{
		key: 'shopping_money',
		label: 'Shopping & Money',
		keywords: ['buy', 'price', 'cost', 'money', 'pay', 'shop', 'cheap', 'expensive']
	},
	{
		key: 'transport_travel',
		label: 'Transport & Travel',
		keywords: ['bus', 'taxi', 'car', 'train', 'airport', 'travel', 'ticket', 'station']
	},
	{
		key: 'family_relationships',
		label: 'Family & Relationships',
		keywords: ['mother', 'father', 'brother', 'sister', 'family', 'friend', 'child', 'wife', 'husband']
	},
	{
		key: 'health_safety',
		label: 'Health & Safety',
		keywords: ['help', 'doctor', 'hospital', 'pain', 'sick', 'medicine', 'emergency', 'police']
	},
	{
		key: 'time_weather',
		label: 'Time, Dates & Weather',
		keywords: ['time', 'clock', 'date', 'day', 'week', 'month', 'rain', 'sun', 'weather']
	},
	{
		key: 'general_conversation',
		label: 'General Conversation',
		keywords: ['how are you', 'fine', 'good', 'bad', 'please', 'thank you', 'sorry', 'yes', 'no']
	}
] as const;

export const DEFAULT_CATEGORY = PHRASE_CATEGORIES.find(
	(category) => category.key === 'general_conversation'
)!;

export function inferPhraseCategory(english: string, translation: string): PhraseCategory {
	const haystack = `${english} ${translation}`.toLowerCase();

	for (const category of PHRASE_CATEGORIES) {
		if (category.keywords.some((keyword) => haystack.includes(keyword))) {
			return category;
		}
	}

	return DEFAULT_CATEGORY;
}

