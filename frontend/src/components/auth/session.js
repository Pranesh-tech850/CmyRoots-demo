/* Keeps the login token in the browser.
   "Remember me" ON  -> localStorage   (stays logged in after closing the browser)
   "Remember me" OFF -> sessionStorage (logged out when the tab is closed)
   Every browser has its own storage, so each browser keeps its own user. */

export const SESSION_KEY = "cmyroots.session";
const KEY = SESSION_KEY;

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
    const s = raw && JSON.parse(raw);
    return s && s.token && s.user?.name ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(session, remember) {
  clearSession();
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage blocked: the user simply has to log in again next time */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {

    /* ignore */
  }
}