import "clsx";
import { D as DEV } from "./false.js";
import { a0 as is_array, a1 as get_prototype_of, a2 as object_prototype, _ as getContext, Z as setContext } from "./context.js";
import { ConvexClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { d as derived } from "./index.js";
import { a as authClient } from "./button.js";
const empty = [];
function snapshot(value, skip_warning = false, no_tojson = false) {
  return clone(value, /* @__PURE__ */ new Map(), "", empty, null, no_tojson);
}
function clone(value, cloned, path, paths, original = null, no_tojson = false) {
  if (typeof value === "object" && value !== null) {
    var unwrapped = cloned.get(value);
    if (unwrapped !== void 0) return unwrapped;
    if (value instanceof Map) return (
      /** @type {Snapshot<T>} */
      new Map(value)
    );
    if (value instanceof Set) return (
      /** @type {Snapshot<T>} */
      new Set(value)
    );
    if (is_array(value)) {
      var copy = (
        /** @type {Snapshot<any>} */
        Array(value.length)
      );
      cloned.set(value, copy);
      if (original !== null) {
        cloned.set(original, copy);
      }
      for (var i = 0; i < value.length; i += 1) {
        var element = value[i];
        if (i in value) {
          copy[i] = clone(element, cloned, path, paths, null, no_tojson);
        }
      }
      return copy;
    }
    if (get_prototype_of(value) === object_prototype) {
      copy = {};
      cloned.set(value, copy);
      if (original !== null) {
        cloned.set(original, copy);
      }
      for (var key in value) {
        copy[key] = clone(
          // @ts-expect-error
          value[key],
          cloned,
          path,
          paths,
          null,
          no_tojson
        );
      }
      return copy;
    }
    if (value instanceof Date) {
      return (
        /** @type {Snapshot<T>} */
        structuredClone(value)
      );
    }
    if (typeof /** @type {T & { toJSON?: any } } */
    value.toJSON === "function" && !no_tojson) {
      return clone(
        /** @type {T & { toJSON(): any } } */
        value.toJSON(),
        cloned,
        path,
        paths,
        // Associate the instance with the toJSON clone
        value
      );
    }
  }
  if (value instanceof EventTarget) {
    return (
      /** @type {Snapshot<T>} */
      value
    );
  }
  try {
    return (
      /** @type {Snapshot<T>} */
      structuredClone(value)
    );
  } catch (e) {
    return (
      /** @type {Snapshot<T>} */
      value
    );
  }
}
const _contextKey = "$$_convexClient";
const useConvexClient = () => {
  const client = getContext(_contextKey);
  if (!client) {
    throw new Error("No ConvexClient was found in Svelte context. Did you forget to call setupConvex() in a parent component?");
  }
  return client;
};
const setConvexClientContext = (client) => {
  setContext(_contextKey, client);
};
const setupConvex = (url, options = {}) => {
  const optionsWithDefaults = { disabled: !DEV, ...options };
  const client = new ConvexClient(url, optionsWithDefaults);
  setConvexClientContext(client);
};
const SKIP = /* @__PURE__ */ Symbol("convex.useQuery.skip");
function useQuery(query, args = {}, options = {}) {
  const client = useConvexClient();
  if (typeof query === "string") {
    throw new Error("Query must be a functionReference object, not a string");
  }
  const state = {
    result: parseOptions(options).initialData,
    lastResult: void 0
  };
  const currentArgs = parseArgs(args);
  parseArgs(args);
  const staleAllowed = !!(parseOptions(options).keepPreviousData && state.lastResult);
  const isSkipped = currentArgs === SKIP;
  const syncResult = (() => {
    if (isSkipped) return void 0;
    const opts = parseOptions(options);
    if (opts.initialData && true) {
      return state.result;
    }
    let value;
    try {
      value = client.disabled ? void 0 : client.client.localQueryResult(getFunctionName(query), currentArgs);
    } catch (e) {
      if (!(e instanceof Error)) {
        console.error("threw non-Error instance", e);
        throw e;
      }
      value = e;
    }
    return value;
  })();
  const result = /* @__PURE__ */ (() => {
    return syncResult !== void 0 ? syncResult : void 0;
  })();
  const isStale = !isSkipped && syncResult === void 0 && staleAllowed;
  const data = (() => {
    if (result instanceof Error) return void 0;
    return result;
  })();
  const error = (() => {
    if (result instanceof Error) return result;
    return void 0;
  })();
  return {
    get data() {
      return data;
    },
    get isLoading() {
      return isSkipped ? false : error === void 0 && data === void 0;
    },
    get error() {
      return error;
    },
    get isStale() {
      return isSkipped ? false : isStale;
    }
  };
}
function parseArgs(args) {
  if (typeof args === "function") {
    args = args();
  }
  if (args === "skip") return SKIP;
  return snapshot(args);
}
function parseOptions(options) {
  if (typeof options === "function") {
    options = options();
  }
  return snapshot(options);
}
const session = authClient.useSession();
const isAuthenticated = derived(session, ($session) => {
  return $session.data !== null && $session.data !== void 0;
});
derived(session, ($session) => {
  return $session.isPending;
});
derived(session, ($session) => {
  return $session.data?.user ?? null;
});
export {
  useQuery as a,
  isAuthenticated as i,
  setupConvex as s,
  useConvexClient as u
};
