import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './auth';
import { payfastWebhook } from './billingNode';

const http = httpRouter();
authComponent.registerRoutes(http, createAuth, {
	cors: true
});

http.route({
	path: '/webhooks/payfast',
	method: 'POST',
	handler: payfastWebhook
});

export default http;
