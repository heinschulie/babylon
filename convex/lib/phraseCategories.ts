export type PhraseCategory = {
	key: string;
	label: string;
	keywords: string[];
};

export const PHRASE_CATEGORIES: readonly PhraseCategory[] = [
	{
		key: 'formal_introductions',
		label: 'Formal Introductions',
		keywords: [
			'name is',
			'introduce',
			'pleased to meet',
			'who are you',
			'where are you from',
			'i come from'
		]
	},
	{
		key: 'daily_greetings',
		label: 'Day-to-Day Greetings',
		keywords: [
			'hello',
			'hi',
			'good morning',
			'good evening',
			'good night',
			'how are you',
			'i am fine',
			'goodbye',
			'see you',
			'molo',
			'molweni'
		]
	},
	{
		key: 'polite_expressions',
		label: 'Polite Expressions',
		keywords: [
			'please',
			'thank you',
			'sorry',
			'excuse me',
			'pardon',
			"you're welcome",
			'no problem',
			'bless'
		]
	},
	{
		key: 'asking_about_family',
		label: 'Asking About Family',
		keywords: [
			'mother',
			'father',
			'brother',
			'sister',
			'child',
			'children',
			'wife',
			'husband',
			'parents',
			'grandmother',
			'grandfather',
			'family',
			'baby',
			'son',
			'daughter'
		]
	},
	{
		key: 'friendships_social',
		label: 'Friendships & Social',
		keywords: [
			'friend',
			'visit',
			'together',
			'invite',
			'gathering',
			'party',
			'neighbour',
			'neighbor',
			'community'
		]
	},
	{
		key: 'catching_up',
		label: 'Catching Up',
		keywords: [
			'how have you been',
			'long time',
			"what's new",
			'tell me about',
			'what happened',
			'news',
			'lately',
			'miss you',
			"haven't seen"
		]
	},
	{
		key: 'making_plans',
		label: 'Making Plans',
		keywords: [
			"let's",
			'shall we',
			'weekend',
			'meet up',
			'appointment',
			'plan',
			'arrange',
			'schedule',
			'available'
		]
	},
	{
		key: 'expressing_feelings',
		label: 'Expressing Feelings & Opinions',
		keywords: [
			'happy',
			'sad',
			'angry',
			'love',
			'afraid',
			'think',
			'feel',
			'believe',
			'worried',
			'excited',
			'tired',
			'bored',
			'hope',
			'wish'
		]
	},
	{
		key: 'directions_navigation',
		label: 'Directions & Finding Places',
		keywords: [
			'where is',
			'left',
			'right',
			'straight',
			'street',
			'road',
			'map',
			'near',
			'far',
			'turn',
			'corner',
			'next to'
		]
	},
	{
		key: 'daily_routines',
		label: 'Daily Routines',
		keywords: [
			'wake up',
			'morning',
			'night',
			'home',
			'work',
			'sleep',
			'eat breakfast',
			'lunch',
			'dinner',
			'shower',
			'school',
			'office'
		]
	},
	{
		key: 'food_drink',
		label: 'Food & Drink',
		keywords: [
			'food',
			'eat',
			'drink',
			'water',
			'tea',
			'coffee',
			'hungry',
			'restaurant',
			'menu',
			'cook',
			'bread',
			'meat',
			'rice',
			'thirsty'
		]
	},
	{
		key: 'shopping_money',
		label: 'Shopping & Money',
		keywords: [
			'buy',
			'price',
			'cost',
			'money',
			'pay',
			'shop',
			'cheap',
			'expensive',
			'rand',
			'change',
			'market',
			'store'
		]
	},
	{
		key: 'transport_travel',
		label: 'Transport & Travel',
		keywords: [
			'bus',
			'taxi',
			'car',
			'train',
			'airport',
			'travel',
			'ticket',
			'station',
			'drive',
			'walk',
			'trip',
			'journey'
		]
	},
	{
		key: 'health_safety',
		label: 'Health & Safety',
		keywords: [
			'help',
			'doctor',
			'hospital',
			'pain',
			'sick',
			'medicine',
			'emergency',
			'police',
			'headache',
			'fever',
			'clinic',
			'hurt'
		]
	},
	{
		key: 'time_weather',
		label: 'Time, Dates & Weather',
		keywords: [
			'time',
			'clock',
			'date',
			'day',
			'week',
			'month',
			'rain',
			'sun',
			'weather',
			'today',
			'tomorrow',
			'yesterday',
			'cold',
			'hot',
			'wind'
		]
	},
	{
		key: 'general_conversation',
		label: 'General Conversation',
		keywords: [
			'yes',
			'no',
			'maybe',
			'okay',
			'what',
			'why',
			'how',
			'can you',
			'do you',
			'i want',
			'i need',
			'i like'
		]
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

