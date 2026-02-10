
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/api" | "/api/auth" | "/api/auth/[...all]" | "/billing" | "/billing/cancel" | "/billing/return" | "/login" | "/practice" | "/register" | "/reveal" | "/reveal/[id]" | "/session" | "/session/[id]" | "/settings";
		RouteParams(): {
			"/api/auth/[...all]": { all: string };
			"/reveal/[id]": { id: string };
			"/session/[id]": { id: string }
		};
		LayoutParams(): {
			"/": { all?: string; id?: string };
			"/api": { all?: string };
			"/api/auth": { all?: string };
			"/api/auth/[...all]": { all: string };
			"/billing": Record<string, never>;
			"/billing/cancel": Record<string, never>;
			"/billing/return": Record<string, never>;
			"/login": Record<string, never>;
			"/practice": Record<string, never>;
			"/register": Record<string, never>;
			"/reveal": { id?: string };
			"/reveal/[id]": { id: string };
			"/session": { id?: string };
			"/session/[id]": { id: string };
			"/settings": Record<string, never>
		};
		Pathname(): "/" | "/api" | "/api/" | "/api/auth" | "/api/auth/" | `/api/auth/${string}` & {} | `/api/auth/${string}/` & {} | "/billing" | "/billing/" | "/billing/cancel" | "/billing/cancel/" | "/billing/return" | "/billing/return/" | "/login" | "/login/" | "/practice" | "/practice/" | "/register" | "/register/" | "/reveal" | "/reveal/" | `/reveal/${string}` & {} | `/reveal/${string}/` & {} | "/session" | "/session/" | `/session/${string}` & {} | `/session/${string}/` & {} | "/settings" | "/settings/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/badge-72.png" | "/icon-192.png" | "/icon-512.png" | "/manifest.json" | "/robots.txt" | "/sw.js" | string & {};
	}
}