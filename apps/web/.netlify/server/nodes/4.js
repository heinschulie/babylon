

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/billing/return/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/4.35616a06.js","_app/immutable/chunks/1f615a2c.js","_app/immutable/chunks/8b0cb860.js","_app/immutable/chunks/a9f1842f.js"];
export const stylesheets = [];
export const fonts = [];
