

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/billing/cancel/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/3.7380a41d.js","_app/immutable/chunks/1f615a2c.js","_app/immutable/chunks/8b0cb860.js","_app/immutable/chunks/a9f1842f.js"];
export const stylesheets = [];
export const fonts = [];
