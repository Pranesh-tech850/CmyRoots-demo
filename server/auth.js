
const crypto = require("crypto");
const express = require("express");
const db = require("./db");

/* =========================================================
   SESSION CONFIGURATION
========================================================= */

const COOKIE_NAME = "cmyroots_session";

// Remember me: 30 days
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Without remember me: 12 hours
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === "production";

// Default: lax.
// For a cross-site frontend/backend deployment, configure:
// COOKIE_SAME_SITE=none
const COOKIE_SAME_SITE = (
  process.env.COOKIE_SAME_SITE || "lax"
).toLowerCase();

if (!["lax", "strict", "none"].includes(COOKIE_SAME_SITE)) {
  throw new Error("Invalid COOKIE_SAME_SITE configuration");
}

if (COOKIE_SAME_SITE === "none" && !isProduction) {
  throw new Error(
    "SameSite=None requires production HTTPS configuration"
  );
}

const cookieOptions = {
  httpOnly: true,
  secure: isProduction || COOKIE_SAME_SITE === "none",
  sameSite: COOKIE_SAME_SITE,
  path: "/",
};


/* =========================================================
   SESSION TOKEN HELPERS
========================================================= */

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Read the session token from the browser cookie.
function getCookieToken(req) {
  const cookieHeader = req?.headers?.cookie || "";

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) continue;

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();

    if (name === COOKIE_NAME) {
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }

  return null;
}


// Send the session token as an HttpOnly cookie.
function setSessionCookie(res, token, remember) {
  const options = { ...cookieOptions };

  // Remember me = persistent browser cookie.
  // Otherwise, browser session cookie.
  if (remember) {
    options.maxAge = REMEMBER_TTL_MS;
  }

  res.cookie(COOKIE_NAME, token, options);
}


// Clear the browser cookie during logout.
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}


/* =========================================================
   PASSWORD HASHING (SCRYPT)
========================================================= */

const scrypt = (password, salt) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1 },
      (err, key) => {
        if (err) return reject(err);
        resolve(key);
      }
    );
  });


async function hashPassword(password) {
  const salt = crypto.randomBytes(16);

  const key = await scrypt(password, salt);

  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}


async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] =
    String(stored || "").split("$");

  if (
    scheme !== "scrypt" ||
    !/^[a-f0-9]{32}$/i.test(saltHex || "") ||
    !/^[a-f0-9]{128}$/i.test(keyHex || "")
  ) {
    return false;
  }

  const expected = Buffer.from(keyHex, "hex");

  const actual = await scrypt(
    password,
    Buffer.from(saltHex, "hex")
  );

  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}


// Used when the account does not exist.
// This helps reduce username-enumeration timing differences.
const DUMMY_HASH =
  "scrypt$" +
  "00".repeat(16) +
  "$" +
  "00".repeat(64);


/* =========================================================
   SIGNUP VALIDATION
========================================================= */

const NAME_RE =
  /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{1,38}[\p{L}\p{N}.]$/u;

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


const cleanName = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();


function validateSignup({
  username,
  email,
  gender,
  password,
}) {
  const name = cleanName(username);

  const cleanEmail = String(email || "").trim();

  if (!NAME_RE.test(name)) {
    return "Name must be 3 to 40 characters: letters, numbers, spaces and . ' _ - only";
  }

  if (
    !EMAIL_RE.test(cleanEmail) ||
    cleanEmail.length > 120
  ) {
    return "Please enter a valid email address";
  }

  if (gender && !["M", "F"].includes(gender)) {
    return "Invalid gender";
  }

  if (
    typeof password !== "string" ||
    password.length < 8
  ) {
    return "Password must be at least 8 characters";
  }

  if (password.length > 100) {
    return "Password is too long";
  }

  if (
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return "Password must contain at least one letter and one number";
  }

  return null;
}


/* =========================================================
   RATE LIMITING
========================================================= */

const attempts = new Map();

function limited(
  ip,
  max = 10,
  windowMs = 10 * 60 * 1000
) {
  const now = Date.now();

  const a = attempts.get(ip);

  if (!a || a.resetAt < now) {
    attempts.set(ip, {
      count: 1,
      resetAt: now + windowMs,
    });

    return false;
  }

  a.count += 1;

  return a.count > max;
}


// Remove expired rate-limit entries.
setInterval(() => {
  const now = Date.now();

  for (const [ip, a] of attempts) {
    if (a.resetAt < now) {
      attempts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();


/* =========================================================
   PUBLIC USER
========================================================= */

// Never send password_hash or session tokens to frontend.
const publicUser = (user) => ({
  name: user.username,
  email: user.email,
  gender: user.gender,
  avatar: user.avatar || "👤",
});


/* =========================================================
   CREATE DATABASE SESSION
========================================================= */

async function createLoginSession(
  user,
  res,
  remember = true
) {
  if (!user?.id) {
    throw new Error("User database ID is missing");
  }

  // Generate a random session token.
  const token = createSessionToken();

  // Determine expiry.
  const ttl = remember
    ? REMEMBER_TTL_MS
    : SESSION_TTL_MS;

  const expiresAt = new Date(Date.now() + ttl);

  // Store only the SHA-256 hash in PostgreSQL.
  await db.createSession(
    user.id,
    token,
    expiresAt
  );

  // Send the original token through an HttpOnly cookie.
  setSessionCookie(res, token, remember);
}


/* =========================================================
   AUTHENTICATION MIDDLEWARE
========================================================= */

async function requireAuth(req, res, next) {
  try {
    // Read session token from cookie.
    const token = getCookieToken(req);

    if (!token) {
      return res.status(401).json({
        error: "Please log in",
      });
    }

    // Validate session against PostgreSQL.
    const session = await db.findSession(token);

    if (!session) {
      clearSessionCookie(res);

      return res.status(401).json({
        error: "Session expired. Please log in again.",
      });
    }

    // Attach authenticated user information.
    req.username = session.username;

    // Actual users table primary key.
    req.userId = session.user_id;

    req.user = {
      username: session.username,
      email: session.email,
      gender: session.gender,
      avatar: session.avatar,
    };

    // Primary key of user_sessions.
    req.sessionId = session.session_id;

    return next();

  } catch (err) {
    console.error(
      "Authentication failed:",
      err.message
    );

    return res.status(500).json({
      error: "Authentication error",
    });
  }
}


/* =========================================================
   AUTHENTICATION ROUTES
========================================================= */

function registerAuthRoutes(
  app,
  { onNewMember, onLogout } = {}
) {
  const json = express.json({
    limit: "10kb",
  });


  /* -------------------------------------------------------
     SIGNUP
  ------------------------------------------------------- */

  app.post(
    "/api/auth/signup",
    json,
    async (req, res) => {
      try {
        if (limited(req.ip, 20)) {
          return res.status(429).json({
            error: "Too many attempts. Try again in a few minutes.",
          });
        }

        const body = req.body || {};

        const problem = validateSignup(body);

        if (problem) {
          return res.status(400).json({
            error: problem,
          });
        }

        const username = cleanName(body.username);

        const email = String(body.email)
          .trim()
          .toLowerCase();

        const gender = body.gender || null;

        // Hash password before saving.
        const passwordHash = await hashPassword(
          body.password
        );

        // Create PostgreSQL account.
        const created = await db.createAccount({
          username,
          email,
          gender,
          passwordHash,
        });

        if (created.error) {
          return res.status(409).json({
            error: created.error,
          });
        }

        // Synchronize newly registered member if configured.
        if (onNewMember) {
          await onNewMember(created.user);
        }

        const remember = body.remember !== false;

        // Create database session and browser cookie.
        await createLoginSession(
          created.user,
          res,
          remember
        );

        return res.status(201).json({
          user: publicUser(created.user),
        });

      } catch (err) {
        console.error(
          "Signup failed:",
          err.message
        );

        return res.status(500).json({
          error: "Could not create the account",
        });
      }
    }
  );


  /* -------------------------------------------------------
     LOGIN
  ------------------------------------------------------- */

  app.post(
    "/api/auth/login",
    json,
    async (req, res) => {
      try {
        if (limited(req.ip)) {
          return res.status(429).json({
            error: "Too many attempts. Try again in a few minutes.",
          });
        }

        const {
          identifier,
          password,
        } = req.body || {};

        if (
          typeof identifier !== "string" ||
          !identifier.trim() ||
          typeof password !== "string" ||
          password.length === 0 ||
          password.length > 100
        ) {
          return res.status(400).json({
            error: "Enter your name or email and your password",
          });
        }

        // Find account by username or email.
        const user = await db.findAccount(identifier);

        // Verify password.
        const ok = await verifyPassword(
          password,
          user?.password_hash || DUMMY_HASH
        );

        if (
          !user ||
          !user.password_hash ||
          !ok
        ) {
          return res.status(401).json({
            error: "Wrong name/email or password",
          });
        }

        const remember =
          req.body?.remember !== false;

        // Create new PostgreSQL session.
        await createLoginSession(
          user,
          res,
          remember
        );

        return res.json({
          user: publicUser(user),
        });

      } catch (err) {
        console.error(
          "Login failed:",
          err.message
        );

        return res.status(500).json({
          error: "Could not log in",
        });
      }
    }
  );


  /* -------------------------------------------------------
     CURRENT USER / RESTORE SESSION
  ------------------------------------------------------- */

  app.get(
    "/api/auth/me",
    requireAuth,
    async (req, res) => {
      try {
        return res.json({
          user: publicUser({
            username: req.user.username,
            email: req.user.email,
            gender: req.user.gender,
            avatar: req.user.avatar,
          }),
        });

      } catch (err) {
        console.error(
          "Session check failed:",
          err.message
        );

        return res.status(500).json({
          error: "Server error",
        });
      }
    }
  );


  /* -------------------------------------------------------
     LOGOUT
  ------------------------------------------------------- */

  app.post(
    "/api/auth/logout",
    async (req, res) => {
      try {
        const token = getCookieToken(req);

        if (token) {
          // Find session before deleting it.
          const session = await db.findSession(token);

          // Delete the session from PostgreSQL.
          await db.deleteSession(token);

          // Disconnect sockets for this exact session.
          if (session && onLogout) {
            await onLogout(session);
          }
        }

        // Remove browser cookie.
        clearSessionCookie(res);

        return res.json({
          message: "Logged out successfully",
        });

      } catch (err) {
        console.error(
          "Logout failed:",
          err.message
        );

        return res.status(500).json({
          error: "Could not log out",
        });
      }
    }
  );
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  registerAuthRoutes,
  requireAuth,
  hashPassword,
  verifyPassword,
  validateSignup,
  getCookieToken,
};
