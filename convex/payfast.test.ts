import { describe, expect, it } from 'vitest';
import {
	buildPayfastCanonicalString,
	buildPayfastSignature,
	normalizePayfastPassphrase,
	parseFormBody
} from './lib/payfast';

describe('payfast utils', () => {
	it('parses x-www-form-urlencoded body', () => {
		const params = parseFormBody('a=1&b=hello+world&empty=');
		expect(params).toEqual({ a: '1', b: 'hello world', empty: '' });
	});

	it('generates stable signature without passphrase', () => {
		const input = {
			merchant_id: '10000100',
			merchant_key: '46f0cd694581a',
			amount: '150.00',
			item_name: 'Xhosa AI Plan',
			custom_str1: 'user-123',
			signature: 'should_be_ignored'
		};

		const signature1 = buildPayfastSignature(input);
		const signature2 = buildPayfastSignature({ ...input });
		expect(signature1).toBe(signature2);
		expect(signature1).toHaveLength(32);
	});

	it('canonicalizes params in insertion order', () => {
		const canonical = buildPayfastCanonicalString({
			item_name: 'Xhosa AI Plan',
			merchant_key: '46f0cd694581a',
			merchant_id: '10000100',
			amount: '150.00'
		});

		expect(canonical).toBe('item_name=Xhosa+AI+Plan&merchant_key=46f0cd694581a&merchant_id=10000100&amount=150.00');
	});

	it('changes signature when passphrase changes', () => {
		const input = {
			merchant_id: '10000100',
			merchant_key: '46f0cd694581a',
			amount: '500.00',
			item_name: 'Xhosa Pro Plan'
		};

		const withoutPassphrase = buildPayfastSignature(input);
		const withPassphrase = buildPayfastSignature(input, 'secret');
		expect(withPassphrase).not.toBe(withoutPassphrase);
	});

	it('ignores blank passphrase values', () => {
		const input = {
			merchant_id: '10000100',
			merchant_key: '46f0cd694581a',
			amount: '500.00',
			item_name: 'Xhosa Pro Plan'
		};

		expect(buildPayfastSignature(input, '   ')).toBe(buildPayfastSignature(input));
		expect(normalizePayfastPassphrase(' \n\t ')).toBeUndefined();
	});
});
