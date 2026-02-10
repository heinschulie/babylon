import { d as derived } from "./index.js";
import { a as authClient } from "./auth-client.js";
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
  isAuthenticated as i
};
