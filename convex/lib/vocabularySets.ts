export interface VocabularyItem {
	english: string;
	xhosa: string;
	searchTerm: string;
}

export interface VocabularySet {
	key: string;
	label: string;
	icon: string;
	items: VocabularyItem[];
}

export const VOCABULARY_SETS: readonly VocabularySet[] = [
	{
		key: 'colors',
		label: 'Colours',
		icon: '🎨',
		items: [
			{ english: 'Red', xhosa: 'Bomvu', searchTerm: 'red color' },
			{ english: 'Blue', xhosa: 'Luhlaza okwesibhakabhaka', searchTerm: 'blue color' },
			{ english: 'Green', xhosa: 'Luhlaza', searchTerm: 'green color' },
			{ english: 'Yellow', xhosa: 'Mthubi', searchTerm: 'yellow color' },
			{ english: 'Black', xhosa: 'Mnyama', searchTerm: 'black color' },
			{ english: 'White', xhosa: 'Mhlophe', searchTerm: 'white color' },
			{ english: 'Orange', xhosa: 'Orenji', searchTerm: 'orange color' },
			{ english: 'Purple', xhosa: 'Mfusa', searchTerm: 'purple color' },
			{ english: 'Brown', xhosa: 'Mdaka', searchTerm: 'brown color' },
			{ english: 'Pink', xhosa: 'Pinki', searchTerm: 'pink color' }
		]
	},
	{
		key: 'numbers',
		label: 'Numbers (1–20)',
		icon: '🔢',
		items: [
			{ english: '1 — One', xhosa: 'Nye', searchTerm: 'one' },
			{ english: '2 — Two', xhosa: 'Mbini', searchTerm: 'two' },
			{ english: '3 — Three', xhosa: 'Ntathu', searchTerm: 'three' },
			{ english: '4 — Four', xhosa: 'Ne', searchTerm: 'four' },
			{ english: '5 — Five', xhosa: 'Ntlanu', searchTerm: 'five' },
			{ english: '6 — Six', xhosa: 'Ntandathu', searchTerm: 'six' },
			{ english: '7 — Seven', xhosa: 'Sixhenxe', searchTerm: 'seven' },
			{ english: '8 — Eight', xhosa: 'Sibhozo', searchTerm: 'eight' },
			{ english: '9 — Nine', xhosa: 'Lithoba', searchTerm: 'nine' },
			{ english: '10 — Ten', xhosa: 'Lishumi', searchTerm: 'ten' },
			{ english: '11 — Eleven', xhosa: 'Lishumi elinanye', searchTerm: 'eleven' },
			{ english: '12 — Twelve', xhosa: 'Lishumi elinesibini', searchTerm: 'twelve' },
			{ english: '13 — Thirteen', xhosa: 'Lishumi elinesithathu', searchTerm: 'thirteen' },
			{ english: '14 — Fourteen', xhosa: 'Lishumi elinesine', searchTerm: 'fourteen' },
			{ english: '15 — Fifteen', xhosa: 'Lishumi elinesihlanu', searchTerm: 'fifteen' },
			{ english: '16 — Sixteen', xhosa: 'Lishumi elinesithandathu', searchTerm: 'sixteen' },
			{ english: '17 — Seventeen', xhosa: 'Lishumi elinesixhenxe', searchTerm: 'seventeen' },
			{ english: '18 — Eighteen', xhosa: 'Lishumi elinesibhozo', searchTerm: 'eighteen' },
			{ english: '19 — Nineteen', xhosa: 'Lishumi elinethoba', searchTerm: 'nineteen' },
			{ english: '20 — Twenty', xhosa: 'Amashumi amabini', searchTerm: 'twenty' }
		]
	},
	{
		key: 'animals',
		label: 'Animals',
		icon: '🦁',
		items: [
			{ english: 'Dog', xhosa: 'Inja', searchTerm: 'dog' },
			{ english: 'Cat', xhosa: 'Ikati', searchTerm: 'cat' },
			{ english: 'Cow', xhosa: 'Inkomo', searchTerm: 'cow' },
			{ english: 'Horse', xhosa: 'Ihashe', searchTerm: 'horse' },
			{ english: 'Chicken', xhosa: 'Inkuku', searchTerm: 'chicken' },
			{ english: 'Lion', xhosa: 'Ingonyama', searchTerm: 'lion' },
			{ english: 'Elephant', xhosa: 'Indlovu', searchTerm: 'elephant' },
			{ english: 'Fish', xhosa: 'Intlanzi', searchTerm: 'fish' },
			{ english: 'Bird', xhosa: 'Intaka', searchTerm: 'bird' },
			{ english: 'Goat', xhosa: 'Ibhokhwe', searchTerm: 'goat' },
			{ english: 'Sheep', xhosa: 'Igusha', searchTerm: 'sheep' },
			{ english: 'Snake', xhosa: 'Inyoka', searchTerm: 'snake' }
		]
	},
	{
		key: 'transport',
		label: 'Transport',
		icon: '🚌',
		items: [
			{ english: 'Car', xhosa: 'Imoto', searchTerm: 'car' },
			{ english: 'Bus', xhosa: 'Ibhasi', searchTerm: 'bus' },
			{ english: 'Taxi', xhosa: 'Iteksi', searchTerm: 'taxi minibus' },
			{ english: 'Train', xhosa: 'Uloliwe', searchTerm: 'train' },
			{ english: 'Bicycle', xhosa: 'Ibhayisekile', searchTerm: 'bicycle' },
			{ english: 'Aeroplane', xhosa: 'Inqwelomoya', searchTerm: 'airplane' },
			{ english: 'Boat', xhosa: 'Isikhephe', searchTerm: 'boat' },
			{ english: 'Motorcycle', xhosa: 'Isithuthuthu', searchTerm: 'motorcycle' },
			{ english: 'Truck', xhosa: 'Ilori', searchTerm: 'truck' },
			{ english: 'Helicopter', xhosa: 'Ihelikoptha', searchTerm: 'helicopter' }
		]
	},
	{
		key: 'body_parts',
		label: 'Body Parts',
		icon: '🦴',
		items: [
			{ english: 'Head', xhosa: 'Intloko', searchTerm: 'head face' },
			{ english: 'Hand', xhosa: 'Isandla', searchTerm: 'hand' },
			{ english: 'Eye', xhosa: 'Iliso', searchTerm: 'eye' },
			{ english: 'Mouth', xhosa: 'Umlomo', searchTerm: 'mouth' },
			{ english: 'Foot', xhosa: 'Unyawo', searchTerm: 'foot' },
			{ english: 'Ear', xhosa: 'Indlebe', searchTerm: 'ear' },
			{ english: 'Nose', xhosa: 'Impumlo', searchTerm: 'nose' },
			{ english: 'Arm', xhosa: 'Ingalo', searchTerm: 'arm' },
			{ english: 'Leg', xhosa: 'Umlenze', searchTerm: 'leg' },
			{ english: 'Stomach', xhosa: 'Isisu', searchTerm: 'stomach' },
			{ english: 'Heart', xhosa: 'Intliziyo', searchTerm: 'heart' },
			{ english: 'Finger', xhosa: 'Umnwe', searchTerm: 'finger' }
		]
	},
	{
		key: 'clothing',
		label: 'Clothing',
		icon: '👕',
		items: [
			{ english: 'Shirt', xhosa: 'Ihempe', searchTerm: 'shirt' },
			{ english: 'Trousers', xhosa: 'Ibhulukhwe', searchTerm: 'trousers' },
			{ english: 'Shoes', xhosa: 'Izihlangu', searchTerm: 'shoes' },
			{ english: 'Hat', xhosa: 'Umnqwazi', searchTerm: 'hat' },
			{ english: 'Dress', xhosa: 'Ilokhwe', searchTerm: 'dress' },
			{ english: 'Jacket', xhosa: 'Ibhatyi', searchTerm: 'jacket' },
			{ english: 'Socks', xhosa: 'Iikawusi', searchTerm: 'socks' },
			{ english: 'Skirt', xhosa: 'Isiketi', searchTerm: 'skirt' },
			{ english: 'Coat', xhosa: 'Ikhowuthi', searchTerm: 'coat' },
			{ english: 'Scarf', xhosa: 'Isikhafu', searchTerm: 'scarf' }
		]
	},
	{
		key: 'food',
		label: 'Food',
		icon: '🍞',
		items: [
			{ english: 'Bread', xhosa: 'Isonka', searchTerm: 'bread' },
			{ english: 'Meat', xhosa: 'Inyama', searchTerm: 'meat' },
			{ english: 'Rice', xhosa: 'Irayisi', searchTerm: 'rice' },
			{ english: 'Milk', xhosa: 'Ubisi', searchTerm: 'milk' },
			{ english: 'Egg', xhosa: 'Iqanda', searchTerm: 'egg' },
			{ english: 'Chicken', xhosa: 'Inkuku', searchTerm: 'cooked chicken' },
			{ english: 'Fish', xhosa: 'Intlanzi', searchTerm: 'cooked fish' },
			{ english: 'Porridge', xhosa: 'Ipapa', searchTerm: 'porridge' },
			{ english: 'Butter', xhosa: 'Ibhotolo', searchTerm: 'butter' },
			{ english: 'Sugar', xhosa: 'Iswekile', searchTerm: 'sugar' },
			{ english: 'Salt', xhosa: 'Ityuwa', searchTerm: 'salt' },
			{ english: 'Cheese', xhosa: 'Itshizi', searchTerm: 'cheese' }
		]
	},
	{
		key: 'drinks',
		label: 'Drinks',
		icon: '☕',
		items: [
			{ english: 'Water', xhosa: 'Amanzi', searchTerm: 'glass of water' },
			{ english: 'Tea', xhosa: 'Iti', searchTerm: 'cup of tea' },
			{ english: 'Coffee', xhosa: 'Ikofu', searchTerm: 'coffee cup' },
			{ english: 'Juice', xhosa: 'Ijusi', searchTerm: 'juice' },
			{ english: 'Beer', xhosa: 'Ibhiya', searchTerm: 'beer' },
			{ english: 'Wine', xhosa: 'Iwayini', searchTerm: 'wine' },
			{ english: 'Soda', xhosa: 'Isidrinki', searchTerm: 'soda drink' },
			{ english: 'Umqombothi', xhosa: 'Umqombothi', searchTerm: 'traditional african beer' }
		]
	},
	{
		key: 'fruits_vegetables',
		label: 'Fruits & Vegetables',
		icon: '🍎',
		items: [
			{ english: 'Apple', xhosa: 'I-apile', searchTerm: 'apple fruit' },
			{ english: 'Banana', xhosa: 'Ibhanana', searchTerm: 'banana' },
			{ english: 'Tomato', xhosa: 'Itumato', searchTerm: 'tomato' },
			{ english: 'Potato', xhosa: 'Itapile', searchTerm: 'potato' },
			{ english: 'Onion', xhosa: 'Itswele', searchTerm: 'onion' },
			{ english: 'Cabbage', xhosa: 'Ikhaphetshu', searchTerm: 'cabbage' },
			{ english: 'Carrot', xhosa: 'Ikhaerothi', searchTerm: 'carrot' },
			{ english: 'Orange', xhosa: 'Iorenji', searchTerm: 'orange fruit' },
			{ english: 'Grape', xhosa: 'Idiliya', searchTerm: 'grape' },
			{ english: 'Pineapple', xhosa: 'Iphayinaphu', searchTerm: 'pineapple' },
			{ english: 'Spinach', xhosa: 'Ispinatshi', searchTerm: 'spinach' },
			{ english: 'Pumpkin', xhosa: 'Ithanga', searchTerm: 'pumpkin' }
		]
	},
	{
		key: 'family_members',
		label: 'Family Members',
		icon: '👨‍👩‍👧‍👦',
		items: [
			{ english: 'Mother', xhosa: 'UMama', searchTerm: 'mother' },
			{ english: 'Father', xhosa: 'UTata', searchTerm: 'father' },
			{ english: 'Brother', xhosa: 'Umntakwethu (m)', searchTerm: 'brother' },
			{ english: 'Sister', xhosa: 'Udadewethu (f)', searchTerm: 'sister' },
			{ english: 'Grandmother', xhosa: 'UMakhulu', searchTerm: 'grandmother' },
			{ english: 'Grandfather', xhosa: 'UTatomkhulu', searchTerm: 'grandfather' },
			{ english: 'Child', xhosa: 'Umntwana', searchTerm: 'child' },
			{ english: 'Son', xhosa: 'Unyana', searchTerm: 'son' },
			{ english: 'Daughter', xhosa: 'Intombi', searchTerm: 'daughter' },
			{ english: 'Uncle', xhosa: 'Umalume', searchTerm: 'uncle' }
		]
	},
	{
		key: 'days_of_week',
		label: 'Days of the Week',
		icon: '📅',
		items: [
			{ english: 'Monday', xhosa: 'UMvulo', searchTerm: 'monday' },
			{ english: 'Tuesday', xhosa: 'ULwesibini', searchTerm: 'tuesday' },
			{ english: 'Wednesday', xhosa: 'ULwesithathu', searchTerm: 'wednesday' },
			{ english: 'Thursday', xhosa: 'ULwesine', searchTerm: 'thursday' },
			{ english: 'Friday', xhosa: 'ULwesihlanu', searchTerm: 'friday' },
			{ english: 'Saturday', xhosa: 'UMgqibelo', searchTerm: 'saturday' },
			{ english: 'Sunday', xhosa: 'ICawa', searchTerm: 'sunday' }
		]
	},
	{
		key: 'weather',
		label: 'Weather',
		icon: '🌤️',
		items: [
			{ english: 'Sun', xhosa: 'Ilanga', searchTerm: 'sun sky' },
			{ english: 'Rain', xhosa: 'Imvula', searchTerm: 'rain' },
			{ english: 'Wind', xhosa: 'Umoya', searchTerm: 'wind' },
			{ english: 'Cloud', xhosa: 'Ilifu', searchTerm: 'cloud' },
			{ english: 'Cold', xhosa: 'Kubanda', searchTerm: 'cold weather' },
			{ english: 'Hot', xhosa: 'Kushushu', searchTerm: 'hot weather sun' },
			{ english: 'Storm', xhosa: 'Isaqhwithi', searchTerm: 'storm' },
			{ english: 'Snow', xhosa: 'Ikhephu', searchTerm: 'snow' }
		]
	},
	{
		key: 'household',
		label: 'Household Items',
		icon: '🏠',
		items: [
			{ english: 'Table', xhosa: 'Itafile', searchTerm: 'table furniture' },
			{ english: 'Chair', xhosa: 'Isitulo', searchTerm: 'chair' },
			{ english: 'Bed', xhosa: 'Ibhedi', searchTerm: 'bed' },
			{ english: 'Door', xhosa: 'Ucango', searchTerm: 'door' },
			{ english: 'Window', xhosa: 'Ifestile', searchTerm: 'window' },
			{ english: 'Cup', xhosa: 'Ikomityi', searchTerm: 'cup' },
			{ english: 'Plate', xhosa: 'Ipleyiti', searchTerm: 'plate' },
			{ english: 'Spoon', xhosa: 'Icephe', searchTerm: 'spoon' },
			{ english: 'Pot', xhosa: 'Imbiza', searchTerm: 'cooking pot' },
			{ english: 'Blanket', xhosa: 'Ingubo', searchTerm: 'blanket' }
		]
	},
	{
		key: 'emotions',
		label: 'Emotions',
		icon: '😊',
		items: [
			{ english: 'Happy', xhosa: 'Onwabile', searchTerm: 'happy person' },
			{ english: 'Sad', xhosa: 'Lusizi', searchTerm: 'sad person' },
			{ english: 'Angry', xhosa: 'Nomsindo', searchTerm: 'angry person' },
			{ english: 'Scared', xhosa: 'Oyikayo', searchTerm: 'scared person' },
			{ english: 'Tired', xhosa: 'Udiniwe', searchTerm: 'tired person' },
			{ english: 'Surprised', xhosa: 'Umangalisiwe', searchTerm: 'surprised person' },
			{ english: 'Excited', xhosa: 'Uvuyile', searchTerm: 'excited person' },
			{ english: 'Calm', xhosa: 'Uzolile', searchTerm: 'calm peaceful' }
		]
	},
	{
		key: 'places',
		label: 'Places',
		icon: '📍',
		items: [
			{ english: 'Home', xhosa: 'Ikhaya', searchTerm: 'home house' },
			{ english: 'School', xhosa: 'Isikolo', searchTerm: 'school' },
			{ english: 'Church', xhosa: 'Icawe', searchTerm: 'church' },
			{ english: 'Shop', xhosa: 'Ivenkile', searchTerm: 'shop store' },
			{ english: 'Hospital', xhosa: 'Isibhedlele', searchTerm: 'hospital' },
			{ english: 'Market', xhosa: 'Imarike', searchTerm: 'market' },
			{ english: 'River', xhosa: 'Umlambo', searchTerm: 'river' },
			{ english: 'Mountain', xhosa: 'Intaba', searchTerm: 'mountain' },
			{ english: 'Beach', xhosa: 'Ulwandle', searchTerm: 'beach' },
			{ english: 'Farm', xhosa: 'Ifama', searchTerm: 'farm' }
		]
	}
];
