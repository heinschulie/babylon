import { a as attr, s as store_get, u as unsubscribe_stores, h as head } from "../../chunks/index2.js";
import { ConvexClient } from "convex/browser";
import { P as PUBLIC_CONVEX_URL } from "../../chunks/public.js";
import { B as Button, a as authClient } from "../../chunks/button.js";
import { r as resolve } from "../../chunks/server2.js";
import { g as goto } from "../../chunks/client.js";
import { s as setupConvex, i as isAuthenticated } from "../../chunks/auth.js";
import "clsx";
import { Z as setContext, _ as getContext } from "../../chunks/context.js";
import isNetworkError from "is-network-error";
const favicon = "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20width='107'%20height='128'%20viewBox='0%200%20107%20128'%3e%3ctitle%3esvelte-logo%3c/title%3e%3cpath%20d='M94.157%2022.819c-10.4-14.885-30.94-19.297-45.792-9.835L22.282%2029.608A29.92%2029.92%200%200%200%208.764%2049.65a31.5%2031.5%200%200%200%203.108%2020.231%2030%2030%200%200%200-4.477%2011.183%2031.9%2031.9%200%200%200%205.448%2024.116c10.402%2014.887%2030.942%2019.297%2045.791%209.835l26.083-16.624A29.92%2029.92%200%200%200%2098.235%2078.35a31.53%2031.53%200%200%200-3.105-20.232%2030%2030%200%200%200%204.474-11.182%2031.88%2031.88%200%200%200-5.447-24.116'%20style='fill:%23ff3e00'/%3e%3cpath%20d='M45.817%20106.582a20.72%2020.72%200%200%201-22.237-8.243%2019.17%2019.17%200%200%201-3.277-14.503%2018%2018%200%200%201%20.624-2.435l.49-1.498%201.337.981a33.6%2033.6%200%200%200%2010.203%205.098l.97.294-.09.968a5.85%205.85%200%200%200%201.052%203.878%206.24%206.24%200%200%200%206.695%202.485%205.8%205.8%200%200%200%201.603-.704L69.27%2076.28a5.43%205.43%200%200%200%202.45-3.631%205.8%205.8%200%200%200-.987-4.371%206.24%206.24%200%200%200-6.698-2.487%205.7%205.7%200%200%200-1.6.704l-9.953%206.345a19%2019%200%200%201-5.296%202.326%2020.72%2020.72%200%200%201-22.237-8.243%2019.17%2019.17%200%200%201-3.277-14.502%2017.99%2017.99%200%200%201%208.13-12.052l26.081-16.623a19%2019%200%200%201%205.3-2.329%2020.72%2020.72%200%200%201%2022.237%208.243%2019.17%2019.17%200%200%201%203.277%2014.503%2018%2018%200%200%201-.624%202.435l-.49%201.498-1.337-.98a33.6%2033.6%200%200%200-10.203-5.1l-.97-.294.09-.968a5.86%205.86%200%200%200-1.052-3.878%206.24%206.24%200%200%200-6.696-2.485%205.8%205.8%200%200%200-1.602.704L37.73%2051.72a5.42%205.42%200%200%200-2.449%203.63%205.79%205.79%200%200%200%20.986%204.372%206.24%206.24%200%200%200%206.698%202.486%205.8%205.8%200%200%200%201.602-.704l9.952-6.342a19%2019%200%200%201%205.295-2.328%2020.72%2020.72%200%200%201%2022.237%208.242%2019.17%2019.17%200%200%201%203.277%2014.503%2018%2018%200%200%201-8.13%2012.053l-26.081%2016.622a19%2019%200%200%201-5.3%202.328'%20style='fill:%23fff'/%3e%3c/svg%3e";
const AUTH_CONTEXT_KEY = /* @__PURE__ */ Symbol("auth-context");
function createSvelteAuthClient({
  authClient: authClient2,
  convexUrl,
  convexClient,
  options,
  externalSession,
  getServerState
}) {
  if (externalSession) {
    return createSvelteAuthClientExternal({
      authClient: authClient2,
      convexUrl,
      convexClient,
      options,
      externalSession
    });
  }
  return createSvelteAuthClientBrowser({ authClient: authClient2, convexUrl, convexClient, options, getServerState });
}
const resolveConvexClient = (convexUrl, passedConvexClient, options) => {
  const url = convexUrl;
  let convexClient = passedConvexClient;
  if (!convexClient) {
    convexClient = setupConvexClient(url, { disabled: false, ...options });
  }
  return { url, convexClient };
};
function createSvelteAuthClientBrowser({
  authClient: authClient2,
  convexUrl,
  convexClient: passedConvexClient,
  options,
  getServerState
}) {
  const serverState = getServerState?.();
  const hasServerState = serverState !== void 0;
  const hasServerAuth = serverState?.isAuthenticated === true;
  let sessionData = null;
  let sessionPending = true;
  let isConvexAuthenticated = hasServerAuth ? true : null;
  let hasReceivedClientData = false;
  let hasEverSettled = false;
  authClient2.useSession().subscribe((session) => {
    hasReceivedClientData = true;
    const wasAuthenticated = sessionData !== null;
    sessionData = session.data;
    sessionPending = session.isPending;
    if (!session.isPending) {
      hasEverSettled = true;
    }
    const isNowAuthenticated = sessionData !== null;
    if (wasAuthenticated && !isNowAuthenticated) {
      isConvexAuthenticated = false;
    }
    if (session.isPending && isConvexAuthenticated !== null && hasEverSettled) {
      isConvexAuthenticated = null;
    }
  });
  const isAuthProviderAuthenticated = sessionData !== null;
  const clientHasTakenOver = hasReceivedClientData && !sessionPending;
  const isAuthenticated2 = clientHasTakenOver ? isAuthProviderAuthenticated && (isConvexAuthenticated ?? false) : hasServerAuth;
  const isLoading = clientHasTakenOver ? sessionPending || isAuthProviderAuthenticated && isConvexAuthenticated === null : !hasServerState;
  resolveConvexClient(convexUrl, passedConvexClient, options);
  const logVerbose = (message) => {
    if (options?.verbose) {
      console.debug(`${/* @__PURE__ */ (/* @__PURE__ */ new Date()).toISOString()} ${message}`);
    }
  };
  const fetchAccessToken = makeFetchAccessTokenBrowser(authClient2, logVerbose);
  setContext(AUTH_CONTEXT_KEY, {
    authClient: authClient2,
    fetchAccessToken,
    get isLoading() {
      return isLoading;
    },
    get isAuthenticated() {
      return isAuthenticated2;
    }
  });
}
function createSvelteAuthClientExternal({
  authClient: authClient2,
  convexUrl,
  convexClient: passedConvexClient,
  options,
  externalSession
}) {
  let isConvexAuthenticated = null;
  const isAuthenticated2 = false;
  const isLoading = isConvexAuthenticated === null;
  resolveConvexClient(convexUrl, passedConvexClient, options);
  const logVerbose = (message) => {
    if (options?.verbose) {
      console.debug(`${/* @__PURE__ */ (/* @__PURE__ */ new Date()).toISOString()} ${message}`);
    }
  };
  const fetchAccessToken = makeFetchAccessTokenExternal(authClient2, externalSession, logVerbose);
  setContext(AUTH_CONTEXT_KEY, {
    authClient: authClient2,
    fetchAccessToken,
    get isLoading() {
      return isLoading;
    },
    get isAuthenticated() {
      return isAuthenticated2;
    }
  });
}
const makeFetchAccessTokenBrowser = (authClient2, logVerbose) => {
  return async ({ forceRefreshToken }) => {
    if (!forceRefreshToken) return null;
    const token = await fetchTokenBrowser(authClient2, logVerbose);
    logVerbose("browser: returning retrieved token");
    return token;
  };
};
const makeFetchAccessTokenExternal = (authClient2, externalSession, logVerbose) => {
  return async () => {
    const rawToken = await externalSession.getAccessToken();
    if (!rawToken) {
      logVerbose("external: no access token");
      return null;
    }
    try {
      const { data } = await authClient2.convex.token(void 0, { headers: { Authorization: `Bearer ${rawToken}` } });
      return data?.token ?? null;
    } catch (e) {
      if (!isNetworkError(e)) {
        throw e;
      }
      logVerbose("external: network error when fetching Convex JWT");
      return null;
    }
  };
};
const setupConvexClient = (convexUrl, options) => {
  let client = null;
  try {
    client = getContext("$$_convexClient");
  } catch {
  }
  if (!client) {
    try {
      setupConvex(convexUrl, options);
      try {
        client = getContext("$$_convexClient");
      } catch {
        console.warn("setupConvex completed but client not available in context");
      }
    } catch (e) {
      console.warn("Failed to setup Convex client:", e);
    }
  }
  if (!client) {
    throw new Error("No ConvexClient was provided. Either pass one to createSvelteAuthClient or call setupConvex() first.");
  }
  return client;
};
const fetchTokenBrowser = async (authClient2, logVerbose) => {
  const initialBackoff = 100;
  const maxBackoff = 1e3;
  let retries = 0;
  const nextBackoff = () => {
    const baseBackoff = initialBackoff * Math.pow(2, retries);
    retries += 1;
    const actualBackoff = Math.min(baseBackoff, maxBackoff);
    const jitter = actualBackoff * (Math.random() - 0.5);
    return actualBackoff + jitter;
  };
  const fetchWithRetry = async () => {
    try {
      const { data } = await authClient2.convex.token();
      return data?.token || null;
    } catch (e) {
      if (!isNetworkError(e)) {
        throw e;
      }
      if (retries > 10) {
        logVerbose(`fetchToken failed with network error, giving up`);
        throw e;
      }
      const backoff = nextBackoff();
      logVerbose(`fetchToken failed with network error, attempting retrying in ${backoff}ms`);
      await new Promise((resolve2) => setTimeout(resolve2, backoff));
      return fetchWithRetry();
    }
  };
  return fetchWithRetry();
};
const CONVEX_URL = PUBLIC_CONVEX_URL;
new ConvexClient(CONVEX_URL);
function Header($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    async function handleLogout() {
      await authClient.signOut();
      goto(resolve("/login"));
    }
    $$renderer2.push(`<header class="app-header"><div class="page-shell page-shell--narrow !py-3 sm:!py-4"><div class="app-header__stack"><div class="app-header__top"><a${attr("href", resolve("/"))} class="app-header__brand"><span class="info-kicker">Rapid Review Desk</span> <span class="app-header__title">Recall Verifier</span></a></div> `);
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="app-header__rail"><nav class="app-header__nav" aria-label="Primary"><a${attr("href", resolve("/"))} class="app-header__link"${attr("data-active", true)}>Queue</a></nav> `);
      Button($$renderer2, {
        variant: "outline",
        size: "sm",
        onclick: handleLogout,
        class: "app-header__action",
        children: ($$renderer3) => {
          $$renderer3.push(`<!---->Logout`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div></header>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children } = $$props;
    setupConvex(CONVEX_URL);
    createSvelteAuthClient({ authClient, convexUrl: CONVEX_URL });
    head("12qhfyh", $$renderer2, ($$renderer3) => {
      $$renderer3.push(`<link rel="icon"${attr("href", favicon)}/>`);
    });
    Header($$renderer2);
    $$renderer2.push(`<!----> `);
    children($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
export {
  _layout as default
};
