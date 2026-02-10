import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';

const handler = createSvelteKitHandler();

export const GET = handler.GET;
export const POST = handler.POST;
