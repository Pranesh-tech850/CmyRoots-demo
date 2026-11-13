/* Talks to the server's auth routes (server/auth.js):
     POST /api/auth/login   { identifier, password }
     POST /api/auth/signup  { username, email, gender, password }
     GET  /api/auth/me      (Bearer token)

   login() and signup() resolve with { token, user } or throw an Error whose
   message is safe to show to the person.
   checkSession() never throws. It resolves with
     { status: "valid", user }  the token is still good
     { status: "invalid" }      the server rejected it (expired / account gone)
     { status: "offline" }      the server could not be reached or had an error,
                                so the saved login is kept and tried again later */

import { SOCKET_URL } from "../constant";

const TIMEOUT_MS = 15000;
const NETWORK_ERROR =
  "Cannot reach the server. Check that it is running and try again.";

async function request(path, { method = "GET", body, token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${SOCKET_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

async function submit(path, body) {
  let result;
  try {
    result = await request(path, { method: "POST", body });
  } catch {
    throw new Error(NETWORK_ERROR);
  }

  const { res, data } = result;
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  if (!data.token || !data.user) throw new Error("Unexpected answer from the server");
  return data;
}

export const login = (identifier, password) =>
  submit("/api/auth/login", { identifier, password });

export const signup = ({ username, email, gender, password }) =>
  submit("/api/auth/signup", { username, email, gender: gender || null, password });

export async function checkSession(token) {
  try {
    const { res, data } = await request("/api/auth/me", { token });
    if (res.status === 401) return { status: "invalid" };
    if (!res.ok || !data.user) return { status: "offline" };
    return { status: "valid", user: data.user };
  } catch {
    return { status: "offline" };
  }
}