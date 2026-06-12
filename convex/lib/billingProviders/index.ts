import { paystackProvider } from './paystack';
import { stripeProvider } from './stripe';
import type { BillingProvider, BillingProviderName } from './types';

const providers: Record<BillingProviderName, BillingProvider> = {
	paystack: paystackProvider,
	stripe: stripeProvider
};

export function getBillingProvider(name: BillingProviderName): BillingProvider {
	return providers[name];
}

export * from './types';
