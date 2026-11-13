
import { SOCKET_URL } from "../constant";

const TIMEOUT_MS = 15000;

const NETWORK_ERROR =
  "Cannot reach the server. Check that it is running and try again.";

async function request(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${SOCKET_URL}${path}`, {
      method,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
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
    result = await request(path, {
      method: "POST",
      body,
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }

  const { res, data } = result;

  if (!res.ok) {
    throw new Error(
      data.error || "Something went wrong. Please try again."
    );
  }

  if (!data.user) {
    throw new Error("Unexpected answer from the server.");
  }

  return data;
}

export const login = (identifier, password, remember = true) =>
  submit("/api/auth/login", {
    identifier,
    password,
    remember,
  });

export const signup = ({
  username,
  email,
  gender,
  password,
  remember = true,
}) =>
  submit("/api/auth/signup", {
    username,
    email,
    gender: gender || null,
    password,
    remember,
  });

export async function checkSession() {
  try {
    const { res, data } = await request("/api/auth/me");

    if (res.status === 401) {
      return { status: "invalid" };
    }

    if (!res.ok || !data.user) {
      return { status: "offline" };
    }

    return {
      status: "success",
      user: data.user,
    };
  } catch {
    return { status: "offline" };
  }
}

export async function logout() {
  const { res, data } = await request("/api/auth/logout", {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(
      data.error || "Unable to log out. Please try again."
    );
  }

  return data;
}
