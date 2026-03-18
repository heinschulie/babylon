import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const ENV_KEYS = [
	'NODE_ENV',
	'SITE_URL',
	'BILLING_DEV_TOGGLE',
	'BILLING_DEV_TOGGLE_ALLOWLIST',
	'BILLING_DEV_TOGGLE_ADMIN_ALLOWLIST',
	'BILLING_DEV_TOGGLE_ALLOW_PRODUCTION'
] as const;

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

let envSnapshot: EnvSnapshot = {};

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

describe('billing dev toggle hardening', () => {
	beforeEach(() => {
		envSnapshot = {};
		for (const key of ENV_KEYS) {
			envSnapshot[key] = process.env[key];
			delete process.env[key];
		}
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			setEnv(key, envSnapshot[key]);
		}
	});

	it('allows local/test usage without explicit allowlist', async () => {
		setEnv('NODE_ENV', 'test');

		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		await asUser.mutation(api.billing.setMyTierForDev, { tier: 'ai' });
		const status = await asUser.query(api.billing.getStatus, {});

		expect(status.devToggleEnabled).toBe(true);
		expect(status.tier).toBe('ai');
		expect(status.status).toBe('active');
	});

	it('fails closed in production by default', async () => {
		setEnv('NODE_ENV', 'production');
		setEnv('SITE_URL', 'https://app.example.com');

		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		await expect(asUser.mutation(api.billing.setMyTierForDev, { tier: 'pro' })).rejects.toThrowError(
			'Dev billing toggle is disabled'
		);

		const status = await asUser.query(api.billing.getStatus, {});
		expect(status.devToggleEnabled).toBe(false);
		expect(status.tier).toBe('free');
	});

	it('requires explicit allowlist and production opt-in when enabled outside local dev', async () => {
		setEnv('NODE_ENV', 'production');
		setEnv('SITE_URL', 'https://app.example.com');
		setEnv('BILLING_DEV_TOGGLE', 'true');
		setEnv('BILLING_DEV_TOGGLE_ALLOWLIST', 'admin-user');

		const t = convexTest(schema, modules);
		const asAdmin = t.withIdentity({ subject: 'admin-user' });
		const asOther = t.withIdentity({ subject: 'user2' });

		await expect(asOther.mutation(api.billing.setMyTierForDev, { tier: 'ai' })).rejects.toThrowError(
			'Dev billing toggle is disabled'
		);
		await expect(asAdmin.mutation(api.billing.setMyTierForDev, { tier: 'ai' })).rejects.toThrowError(
			'Dev billing toggle is disabled'
		);

		setEnv('BILLING_DEV_TOGGLE_ALLOW_PRODUCTION', 'true');
		await asAdmin.mutation(api.billing.setMyTierForDev, { tier: 'pro' });

		const adminStatus = await asAdmin.query(api.billing.getStatus, {});
		const otherStatus = await asOther.query(api.billing.getStatus, {});

		expect(adminStatus.devToggleEnabled).toBe(true);
		expect(adminStatus.tier).toBe('pro');
		expect(otherStatus.devToggleEnabled).toBe(false);
	});
});
