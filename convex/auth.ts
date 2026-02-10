import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';

const siteUrl = process.env.SITE_URL!;
const authSecret = process.env.BETTER_AUTH_SECRET!;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	const verifierSiteUrl = process.env.VERIFIER_SITE_URL;
	const trustedOrigins = [
		'http://localhost:5173',
		'http://localhost:5178',
		'http://localhost:5180',
		siteUrl,
		verifierSiteUrl
	].filter(Boolean) as string[];

	return betterAuth({
		baseURL: siteUrl,
		secret: authSecret,
		trustedOrigins,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false
		},
		plugins: [
			organization({
				allowUserToCreateOrganization: false,
				teams: {
					enabled: true
				}
			}),
			convex({ authConfig })
		]
	});
};
