

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.7db6f60d.js","_app/immutable/chunks/8245242a.js","_app/immutable/chunks/892810b2.js","_app/immutable/chunks/6df5f7eb.js","_app/immutable/chunks/4997b911.js","_app/immutable/chunks/fc255337.js"];
export const stylesheets = [];
export const fonts = [];
