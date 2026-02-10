import { APIError } from "better-call";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { jwtDecrypt, calculateJwkThumbprint, base64url, jwtVerify, EncryptJWT, SignJWT } from "jose";
import { BetterAuthError } from "@better-auth/core/error";
import "@better-auth/utils/hex";
import { createRandomStringGenerator } from "@better-auth/utils/random";
import "@better-auth/utils";
import "@better-auth/utils/hash";
import { safeJSONParse } from "@better-auth/core/utils";
import * as z from "zod";
import { isProduction } from "@better-auth/core/env";
import { base64Url } from "@better-auth/utils/base64";
import "@better-auth/utils/binary";
import { createHMAC } from "@better-auth/utils/hmac";
import { JWT_COOKIE_NAME } from "@convex-dev/better-auth/plugins";
import { a as PUBLIC_CONVEX_SITE_URL } from "./public.js";
const getDate = (span, unit = "ms") => {
  return new Date(Date.now() + (unit === "sec" ? span * 1e3 : span));
};
const cache = /* @__PURE__ */ new WeakMap();
function parseOutputData(data, schema) {
  const fields = schema.fields;
  const parsedData = {};
  for (const key in data) {
    const field = fields[key];
    if (!field) {
      parsedData[key] = data[key];
      continue;
    }
    if (field.returned === false) continue;
    parsedData[key] = data[key];
  }
  return parsedData;
}
function getAllFields(options, table) {
  if (!cache.has(options)) cache.set(options, /* @__PURE__ */ new Map());
  const tableCache = cache.get(options);
  if (tableCache.has(table)) return tableCache.get(table);
  let schema = {
    ...table === "user" ? options.user?.additionalFields : {},
    ...table === "session" ? options.session?.additionalFields : {}
  };
  for (const plugin of options.plugins || []) if (plugin.schema && plugin.schema[table]) schema = {
    ...schema,
    ...plugin.schema[table].fields
  };
  cache.get(options).set(table, schema);
  return schema;
}
function parseUserOutput(options, user) {
  return {
    ...parseOutputData(user, { fields: getAllFields(options, "user") }),
    id: user.id
  };
}
function parseAccountOutput(options, account) {
  return parseOutputData(account, { fields: getAllFields(options, "account") });
}
function parseSessionOutput(options, session) {
  return parseOutputData(session, { fields: getAllFields(options, "session") });
}
function parseInputData(data, schema) {
  const action = schema.action || "create";
  const fields = schema.fields;
  const parsedData = Object.assign(/* @__PURE__ */ Object.create(null), null);
  for (const key in fields) {
    if (key in data) {
      if (fields[key].input === false) {
        if (fields[key].defaultValue !== void 0) {
          if (action !== "update") {
            parsedData[key] = fields[key].defaultValue;
            continue;
          }
        }
        if (data[key]) throw new APIError("BAD_REQUEST", { message: `${key} is not allowed to be set` });
        continue;
      }
      if (fields[key].validator?.input && data[key] !== void 0) {
        const result = fields[key].validator.input["~standard"].validate(data[key]);
        if (result instanceof Promise) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Async validation is not supported for additional fields" });
        if ("issues" in result && result.issues) throw new APIError("BAD_REQUEST", { message: result.issues[0]?.message || "Validation Error" });
        parsedData[key] = result.value;
        continue;
      }
      if (fields[key].transform?.input && data[key] !== void 0) {
        parsedData[key] = fields[key].transform?.input(data[key]);
        continue;
      }
      parsedData[key] = data[key];
      continue;
    }
    if (fields[key].defaultValue !== void 0 && action === "create") {
      if (typeof fields[key].defaultValue === "function") {
        parsedData[key] = fields[key].defaultValue();
        continue;
      }
      parsedData[key] = fields[key].defaultValue;
      continue;
    }
    if (fields[key].required && action === "create") throw new APIError("BAD_REQUEST", { message: `${key} is required` });
  }
  return parsedData;
}
function parseUserInput(options, user = {}, action) {
  return parseInputData(user, {
    fields: getAllFields(options, "user"),
    action
  });
}
function parseAdditionalUserInput(options, user) {
  const schema = getAllFields(options, "user");
  return parseInputData(user || {}, { fields: schema });
}
function parseAccountInput(options, account) {
  return parseInputData(account, { fields: getAllFields(options, "account") });
}
function parseSessionInput(options, session) {
  return parseInputData(session, { fields: getAllFields(options, "session") });
}
function mergeSchema(schema, newSchema) {
  if (!newSchema) return schema;
  for (const table in newSchema) {
    const newModelName = newSchema[table]?.modelName;
    if (newModelName) schema[table].modelName = newModelName;
    for (const field in schema[table].fields) {
      const newField = newSchema[table]?.fields?.[field];
      if (!newField) continue;
      schema[table].fields[field].fieldName = newField;
    }
  }
  return schema;
}
async function signJWT(payload, secret, expiresIn = 3600) {
  return await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1e3) + expiresIn).sign(new TextEncoder().encode(secret));
}
async function verifyJWT(token, secret) {
  try {
    return (await jwtVerify(token, new TextEncoder().encode(secret))).payload;
  } catch {
    return null;
  }
}
const info = new Uint8Array([
  66,
  101,
  116,
  116,
  101,
  114,
  65,
  117,
  116,
  104,
  46,
  106,
  115,
  32,
  71,
  101,
  110,
  101,
  114,
  97,
  116,
  101,
  100,
  32,
  69,
  110,
  99,
  114,
  121,
  112,
  116,
  105,
  111,
  110,
  32,
  75,
  101,
  121
]);
const now = () => Date.now() / 1e3 | 0;
const alg = "dir";
const enc = "A256CBC-HS512";
async function symmetricEncodeJWT(payload, secret, salt, expiresIn = 3600) {
  const encryptionSecret = hkdf(sha256, new TextEncoder().encode(secret), new TextEncoder().encode(salt), info, 64);
  const thumbprint = await calculateJwkThumbprint({
    kty: "oct",
    k: base64url.encode(encryptionSecret)
  }, "sha256");
  return await new EncryptJWT(payload).setProtectedHeader({
    alg,
    enc,
    kid: thumbprint
  }).setIssuedAt().setExpirationTime(now() + expiresIn).setJti(crypto.randomUUID()).encrypt(encryptionSecret);
}
async function symmetricDecodeJWT(token, secret, salt) {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, async ({ kid }) => {
      const encryptionSecret = hkdf(sha256, new TextEncoder().encode(secret), new TextEncoder().encode(salt), info, 64);
      if (kid === void 0) return encryptionSecret;
      if (kid === await calculateJwkThumbprint({
        kty: "oct",
        k: base64url.encode(encryptionSecret)
      }, "sha256")) return encryptionSecret;
      throw new Error("no matching decryption secret");
    }, {
      clockTolerance: 15,
      keyManagementAlgorithms: [alg],
      contentEncryptionAlgorithms: [enc, "A256GCM"]
    });
    return payload;
  } catch {
    return null;
  }
}
const generateRandomString = createRandomStringGenerator("a-z", "0-9", "A-Z", "-_");
const ALLOWED_COOKIE_SIZE = 4096;
const ESTIMATED_EMPTY_COOKIE_SIZE = 200;
const CHUNK_SIZE = ALLOWED_COOKIE_SIZE - ESTIMATED_EMPTY_COOKIE_SIZE;
function parseCookiesFromContext(ctx) {
  const cookieHeader = ctx.headers?.get("cookie");
  if (!cookieHeader) return {};
  const cookies = {};
  const pairs = cookieHeader.split("; ");
  for (const pair of pairs) {
    const [name, ...valueParts] = pair.split("=");
    if (name && valueParts.length > 0) cookies[name] = valueParts.join("=");
  }
  return cookies;
}
function getChunkIndex(cookieName) {
  const parts = cookieName.split(".");
  const lastPart = parts[parts.length - 1];
  const index = parseInt(lastPart || "0", 10);
  return isNaN(index) ? 0 : index;
}
function readExistingChunks(cookieName, ctx) {
  const chunks = {};
  const cookies = parseCookiesFromContext(ctx);
  for (const [name, value] of Object.entries(cookies)) if (name.startsWith(cookieName)) chunks[name] = value;
  return chunks;
}
function joinChunks(chunks) {
  return Object.keys(chunks).sort((a, b) => {
    return getChunkIndex(a) - getChunkIndex(b);
  }).map((key) => chunks[key]).join("");
}
function chunkCookie(storeName, cookie, chunks, logger) {
  const chunkCount = Math.ceil(cookie.value.length / CHUNK_SIZE);
  if (chunkCount === 1) {
    chunks[cookie.name] = cookie.value;
    return [cookie];
  }
  const cookies = [];
  for (let i = 0; i < chunkCount; i++) {
    const name = `${cookie.name}.${i}`;
    const start = i * CHUNK_SIZE;
    const value = cookie.value.substring(start, start + CHUNK_SIZE);
    cookies.push({
      ...cookie,
      name,
      value
    });
    chunks[name] = value;
  }
  logger.debug(`CHUNKING_${storeName.toUpperCase()}_COOKIE`, {
    message: `${storeName} cookie exceeds allowed ${ALLOWED_COOKIE_SIZE} bytes.`,
    emptyCookieSize: ESTIMATED_EMPTY_COOKIE_SIZE,
    valueSize: cookie.value.length,
    chunkCount,
    chunks: cookies.map((c) => c.value.length + ESTIMATED_EMPTY_COOKIE_SIZE)
  });
  return cookies;
}
function getCleanCookies(chunks, cookieOptions) {
  const cleanedChunks = {};
  for (const name in chunks) cleanedChunks[name] = {
    name,
    value: "",
    options: {
      ...cookieOptions,
      maxAge: 0
    }
  };
  return cleanedChunks;
}
const storeFactory = (storeName) => (cookieName, cookieOptions, ctx) => {
  const chunks = readExistingChunks(cookieName, ctx);
  const logger = ctx.context.logger;
  return {
    getValue() {
      return joinChunks(chunks);
    },
    hasChunks() {
      return Object.keys(chunks).length > 0;
    },
    chunk(value, options) {
      const cleanedChunks = getCleanCookies(chunks, cookieOptions);
      for (const name in chunks) delete chunks[name];
      const cookies = cleanedChunks;
      const chunked = chunkCookie(storeName, {
        name: cookieName,
        value,
        options: {
          ...cookieOptions,
          ...options
        }
      }, chunks, logger);
      for (const chunk of chunked) cookies[chunk.name] = chunk;
      return Object.values(cookies);
    },
    clean() {
      const cleanedChunks = getCleanCookies(chunks, cookieOptions);
      for (const name in chunks) delete chunks[name];
      return Object.values(cleanedChunks);
    },
    setCookies(cookies) {
      for (const cookie of cookies) ctx.setCookie(cookie.name, cookie.value, cookie.options);
    }
  };
};
const createSessionStore = storeFactory("Session");
const createAccountStore = storeFactory("Account");
function getChunkedCookie(ctx, cookieName) {
  const value = ctx.getCookie(cookieName);
  if (value) return value;
  const chunks = [];
  const cookieHeader = ctx.headers?.get("cookie");
  if (!cookieHeader) return null;
  const cookies = {};
  const pairs = cookieHeader.split("; ");
  for (const pair of pairs) {
    const [name, ...valueParts] = pair.split("=");
    if (name && valueParts.length > 0) cookies[name] = valueParts.join("=");
  }
  for (const [name, val] of Object.entries(cookies)) if (name.startsWith(cookieName + ".")) {
    const indexStr = name.split(".").at(-1);
    const index = parseInt(indexStr || "0", 10);
    if (!isNaN(index)) chunks.push({
      index,
      value: val
    });
  }
  if (chunks.length > 0) {
    chunks.sort((a, b) => a.index - b.index);
    return chunks.map((c) => c.value).join("");
  }
  return null;
}
async function setAccountCookie(c, accountData) {
  const accountDataCookie = c.context.authCookies.accountData;
  const options = {
    maxAge: 300,
    ...accountDataCookie.options
  };
  const data = await symmetricEncodeJWT(accountData, c.context.secret, "better-auth-account", options.maxAge);
  if (data.length > ALLOWED_COOKIE_SIZE) {
    const accountStore = createAccountStore(accountDataCookie.name, options, c);
    const cookies = accountStore.chunk(data, options);
    accountStore.setCookies(cookies);
  } else {
    const accountStore = createAccountStore(accountDataCookie.name, options, c);
    if (accountStore.hasChunks()) {
      const cleanCookies = accountStore.clean();
      accountStore.setCookies(cleanCookies);
    }
    c.setCookie(accountDataCookie.name, data, options);
  }
}
async function getAccountCookie(c) {
  const accountCookie = getChunkedCookie(c, c.context.authCookies.accountData.name);
  if (accountCookie) {
    const accountData = safeJSONParse(await symmetricDecodeJWT(accountCookie, c.context.secret, "better-auth-account"));
    if (accountData) return accountData;
  }
  return null;
}
const getSessionQuerySchema = z.optional(z.object({
  disableCookieCache: z.coerce.boolean().meta({ description: "Disable cookie cache and fetch session from database" }).optional(),
  disableRefresh: z.coerce.boolean().meta({ description: "Disable session refresh. Useful for checking session status, without updating the session" }).optional()
}));
const SEC = 1e3;
const MIN = SEC * 60;
const HOUR = MIN * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365.25;
const REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|yrs?|y)(?: (ago|from now))?$/i;
function parse(value) {
  const match = REGEX.exec(value);
  if (!match || match[4] && match[1]) throw new TypeError(`Invalid time string format: "${value}". Use formats like "7d", "30m", "1 hour", etc.`);
  const n = parseFloat(match[2]);
  const unit = match[3].toLowerCase();
  let result;
  switch (unit) {
    case "years":
    case "year":
    case "yrs":
    case "yr":
    case "y":
      result = n * YEAR;
      break;
    case "months":
    case "month":
    case "mo":
      result = n * MONTH;
      break;
    case "weeks":
    case "week":
    case "w":
      result = n * WEEK;
      break;
    case "days":
    case "day":
    case "d":
      result = n * DAY;
      break;
    case "hours":
    case "hour":
    case "hrs":
    case "hr":
    case "h":
      result = n * HOUR;
      break;
    case "minutes":
    case "minute":
    case "mins":
    case "min":
    case "m":
      result = n * MIN;
      break;
    case "seconds":
    case "second":
    case "secs":
    case "sec":
    case "s":
      result = n * SEC;
      break;
    default:
      throw new TypeError(`Unknown time unit: "${unit}"`);
  }
  if (match[1] === "-" || match[4] === "ago") return -result;
  return result;
}
function sec(value) {
  return Math.round(parse(value) / 1e3);
}
function createCookieGetter(options) {
  const secureCookiePrefix = (options.advanced?.useSecureCookies !== void 0 ? options.advanced?.useSecureCookies : options.baseURL !== void 0 ? options.baseURL.startsWith("https://") ? true : false : isProduction) ? "__Secure-" : "";
  const crossSubdomainEnabled = !!options.advanced?.crossSubDomainCookies?.enabled;
  const domain = crossSubdomainEnabled ? options.advanced?.crossSubDomainCookies?.domain || (options.baseURL ? new URL(options.baseURL).hostname : void 0) : void 0;
  if (crossSubdomainEnabled && !domain) throw new BetterAuthError("baseURL is required when crossSubdomainCookies are enabled");
  function createCookie(cookieName, overrideAttributes = {}) {
    const prefix = options.advanced?.cookiePrefix || "better-auth";
    const name = options.advanced?.cookies?.[cookieName]?.name || `${prefix}.${cookieName}`;
    const attributes = options.advanced?.cookies?.[cookieName]?.attributes;
    return {
      name: `${secureCookiePrefix}${name}`,
      attributes: {
        secure: !!secureCookiePrefix,
        sameSite: "lax",
        path: "/",
        httpOnly: true,
        ...crossSubdomainEnabled ? { domain } : {},
        ...options.advanced?.defaultCookieAttributes,
        ...overrideAttributes,
        ...attributes
      }
    };
  }
  return createCookie;
}
function getCookies(options) {
  const createCookie = createCookieGetter(options);
  const sessionToken = createCookie("session_token", { maxAge: options.session?.expiresIn || sec("7d") });
  const sessionData = createCookie("session_data", { maxAge: options.session?.cookieCache?.maxAge || 300 });
  const accountData = createCookie("account_data", { maxAge: options.session?.cookieCache?.maxAge || 300 });
  const dontRememberToken = createCookie("dont_remember");
  return {
    sessionToken: {
      name: sessionToken.name,
      options: sessionToken.attributes
    },
    sessionData: {
      name: sessionData.name,
      options: sessionData.attributes
    },
    dontRememberToken: {
      name: dontRememberToken.name,
      options: dontRememberToken.attributes
    },
    accountData: {
      name: accountData.name,
      options: accountData.attributes
    }
  };
}
async function setCookieCache(ctx, session, dontRememberMe) {
  if (ctx.context.options.session?.cookieCache?.enabled) {
    const filteredSession = Object.entries(session.session).reduce((acc, [key, value]) => {
      const fieldConfig = ctx.context.options.session?.additionalFields?.[key];
      if (!fieldConfig || fieldConfig.returned !== false) acc[key] = value;
      return acc;
    }, {});
    const filteredUser = parseUserOutput(ctx.context.options, session.user);
    const versionConfig = ctx.context.options.session?.cookieCache?.version;
    let version = "1";
    if (versionConfig) {
      if (typeof versionConfig === "string") version = versionConfig;
      else if (typeof versionConfig === "function") {
        const result = versionConfig(session.session, session.user);
        version = result instanceof Promise ? await result : result;
      }
    }
    const sessionData = {
      session: filteredSession,
      user: filteredUser,
      updatedAt: Date.now(),
      version
    };
    const options = {
      ...ctx.context.authCookies.sessionData.options,
      maxAge: dontRememberMe ? void 0 : ctx.context.authCookies.sessionData.options.maxAge
    };
    const expiresAtDate = getDate(options.maxAge || 60, "sec").getTime();
    const strategy = ctx.context.options.session?.cookieCache?.strategy || "compact";
    let data;
    if (strategy === "jwe") data = await symmetricEncodeJWT(sessionData, ctx.context.secret, "better-auth-session", options.maxAge || 300);
    else if (strategy === "jwt") data = await signJWT(sessionData, ctx.context.secret, options.maxAge || 300);
    else data = base64Url.encode(JSON.stringify({
      session: sessionData,
      expiresAt: expiresAtDate,
      signature: await createHMAC("SHA-256", "base64urlnopad").sign(ctx.context.secret, JSON.stringify({
        ...sessionData,
        expiresAt: expiresAtDate
      }))
    }), { padding: false });
    if (data.length > 4093) {
      const sessionStore = createSessionStore(ctx.context.authCookies.sessionData.name, options, ctx);
      const cookies = sessionStore.chunk(data, options);
      sessionStore.setCookies(cookies);
    } else {
      const sessionStore = createSessionStore(ctx.context.authCookies.sessionData.name, options, ctx);
      if (sessionStore.hasChunks()) {
        const cleanCookies = sessionStore.clean();
        sessionStore.setCookies(cleanCookies);
      }
      ctx.setCookie(ctx.context.authCookies.sessionData.name, data, options);
    }
  }
}
async function setSessionCookie(ctx, session, dontRememberMe, overrides) {
  const dontRememberMeCookie = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret);
  dontRememberMe = dontRememberMe !== void 0 ? dontRememberMe : !!dontRememberMeCookie;
  const options = ctx.context.authCookies.sessionToken.options;
  const maxAge = dontRememberMe ? void 0 : ctx.context.sessionConfig.expiresIn;
  await ctx.setSignedCookie(ctx.context.authCookies.sessionToken.name, session.session.token, ctx.context.secret, {
    ...options,
    maxAge,
    ...overrides
  });
  if (dontRememberMe) await ctx.setSignedCookie(ctx.context.authCookies.dontRememberToken.name, "true", ctx.context.secret, ctx.context.authCookies.dontRememberToken.options);
  await setCookieCache(ctx, session, dontRememberMe);
  ctx.context.setNewSession(session);
  if (ctx.context.options.secondaryStorage) await ctx.context.secondaryStorage?.set(session.session.token, JSON.stringify({
    user: session.user,
    session: session.session
  }), Math.floor((new Date(session.session.expiresAt).getTime() - Date.now()) / 1e3));
}
function deleteSessionCookie(ctx, skipDontRememberMe) {
  ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
    ...ctx.context.authCookies.sessionToken.options,
    maxAge: 0
  });
  ctx.setCookie(ctx.context.authCookies.sessionData.name, "", {
    ...ctx.context.authCookies.sessionData.options,
    maxAge: 0
  });
  if (ctx.context.options.account?.storeAccountCookie) {
    ctx.setCookie(ctx.context.authCookies.accountData.name, "", {
      ...ctx.context.authCookies.accountData.options,
      maxAge: 0
    });
    const accountStore = createAccountStore(ctx.context.authCookies.accountData.name, ctx.context.authCookies.accountData.options, ctx);
    const cleanCookies$1 = accountStore.clean();
    accountStore.setCookies(cleanCookies$1);
  }
  if (ctx.context.oauthConfig.storeStateStrategy === "cookie") {
    const stateCookie = ctx.context.createAuthCookie("oauth_state");
    ctx.setCookie(stateCookie.name, "", {
      ...stateCookie.attributes,
      maxAge: 0
    });
  }
  const sessionStore = createSessionStore(ctx.context.authCookies.sessionData.name, ctx.context.authCookies.sessionData.options, ctx);
  const cleanCookies = sessionStore.clean();
  sessionStore.setCookies(cleanCookies);
  ctx.setCookie(ctx.context.authCookies.dontRememberToken.name, "", {
    ...ctx.context.authCookies.dontRememberToken.options,
    maxAge: 0
  });
}
const getToken = async (createAuth, cookies) => {
  const options = createAuth({}).options;
  const createCookie = createCookieGetter(options);
  const cookie = createCookie(JWT_COOKIE_NAME);
  const token = cookies.get(cookie.name);
  if (!token) {
    const isSecure = cookie.name.startsWith("__Secure-");
    const insecureCookieName = cookie.name.replace("__Secure-", "");
    const secureCookieName = isSecure ? cookie.name : `__Secure-${insecureCookieName}`;
    const insecureValue = cookies.get(insecureCookieName);
    const secureValue = cookies.get(secureCookieName);
    if (isSecure && insecureValue) {
      console.warn(`Looking for secure cookie "${cookie.name}" but found insecure cookie "${insecureCookieName}".`);
    }
    if (!isSecure && secureValue) {
      console.warn(`Looking for insecure cookie "${cookie.name}" but found secure cookie "${secureCookieName}".`);
    }
  }
  return token;
};
const handler = (request, opts) => {
  const requestUrl = new URL(request.url);
  const convexSiteUrl = PUBLIC_CONVEX_SITE_URL;
  const nextUrl = `${convexSiteUrl}${requestUrl.pathname}${requestUrl.search}`;
  const newRequest = new Request(nextUrl, request);
  newRequest.headers.set("accept-encoding", "application/json");
  return fetch(newRequest, { method: request.method, redirect: "manual" });
};
const createSvelteKitHandler = (opts) => {
  const requestHandler = async ({ request }) => {
    return handler(request);
  };
  return {
    GET: requestHandler,
    POST: requestHandler
  };
};
export {
  parseSessionOutput as a,
  parseSessionInput as b,
  createSvelteKitHandler as c,
  getDate as d,
  parseUserInput as e,
  parseInputData as f,
  generateRandomString as g,
  parseAdditionalUserInput as h,
  parseAccountOutput as i,
  parseAccountInput as j,
  getSessionQuerySchema as k,
  getChunkedCookie as l,
  mergeSchema as m,
  setCookieCache as n,
  deleteSessionCookie as o,
  parseUserOutput as p,
  setSessionCookie as q,
  getAccountCookie as r,
  symmetricDecodeJWT as s,
  setAccountCookie as t,
  signJWT as u,
  verifyJWT as v,
  getCookies as w,
  createCookieGetter as x,
  getToken as y
};
