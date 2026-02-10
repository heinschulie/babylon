import { i as initial_base, b as base } from "./server.js";
import { r as resolve_route } from "./routing.js";
import { try_get_request_store } from "@sveltejs/kit/internal/server";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function resolve(id, params) {
  const resolved = resolve_route(
    id,
    /** @type {Record<string, string>} */
    params
  );
  {
    const store = try_get_request_store();
    if (store && !store.state.prerendering?.fallback) {
      const after_base = store.event.url.pathname.slice(initial_base.length);
      const segments = after_base.split("/").slice(2);
      const prefix = segments.map(() => "..").join("/") || ".";
      return prefix + resolved;
    }
  }
  return base + resolved;
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
export {
  cn as c,
  resolve as r
};
