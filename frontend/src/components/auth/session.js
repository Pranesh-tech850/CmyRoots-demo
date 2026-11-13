
/*
  CmyRoots - Session Management

  Authentication is handled by the backend using:
  - PostgreSQL user_sessions table
  - HttpOnly session cookies
  - Backend session validation

  We no longer store authentication tokens in:
  - localStorage
  - sessionStorage

  The browser automatically sends the HttpOnly cookie
  when fetch requests use credentials: "include".
*/

// Kept temporarily for compatibility with older imports.

export const SESSION_KEY = "cmyroots.session";

/*
  Session restoration is handled by:
  checkSession() in authapi.js

  This function is no longer responsible for
  loading authentication details from browser storage.
*/
export function loadSession() {
  return null;
}

/*
  Authentication sessions are created by the backend.

  No token or user session is stored in browser storage.
*/
export function saveSession() {
  // No browser storage required.
}

/*
  Logout is handled by:
  POST /api/auth/logout

  The backend deletes the PostgreSQL session
  and clears the HttpOnly cookie.
*/
export function clearSession() {
  // No browser storage required.
}
