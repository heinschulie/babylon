import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './auth';
import { paystackWebhook, stripeWebhook } from './billingWebhooks';

const http = httpRouter();
authComponent.registerRoutes(http, createAuth, {
	cors: true
});

http.route({
	path: '/webhooks/paystack',
	method: 'POST',
	handler: paystackWebhook
});

http.route({
	path: '/webhooks/stripe',
	method: 'POST',
	handler: stripeWebhook
});

export default http;
