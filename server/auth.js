const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const express = require("express");
const db = require("./db");

/* ---------- secret ---------- */
let SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  SECRET = crypto.randomBytes(48).toString("hex");
  console.warn(
    "⚠️  JWT_SECRET is not set in server/.env: using a temporary one.\n" +
      "   Everybody will be logged out each time the server restarts."
  );
}
const TOKEN_TTL = "7d";

/* ---------- password hashing (scrypt, built into Node) ---------- */
const scrypt = (password, salt) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/* compared against when the account does not exist (same response time) */
const DUMMY_HASH = "scrypt$" + "00".repeat(16) + "$" + "00".repeat(64);

/* ---------- tokens ---------- */
const signToken = (username) => jwt.sign({ sub: username }, SECRET, { expiresIn: TOKEN_TTL });

function verifyToken(token) {
  try {
    return jwt.verify(String(token || ""), SECRET).sub || null;
  } catch {
    return null;
  }
}

/* ---------- validation ---------- */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{1,38}[\p{L}\p{N}.]$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cleanName = (s) => String(s || "").replace(/\s+/g, " ").trim();

function validateSignup({ username, email, gender, password }) {
  const name = cleanName(username);
  if (!NAME_RE.test(name)) {
    return "Name must be 3 to 40 characters: letters, numbers, spaces and . ' _ - only";
  }
  if (!EMAIL_RE.test(String(email || "").trim()) || String(email).length > 120) {
    return "Please enter a valid email address";
  }
  if (gender && !["M", "F"].includes(gender)) return "Invalid gender";
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 100) return "Password is too long";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain at least one letter and one number";
  }
  return null;
}

/* ---------- tiny rate limit (per IP, in memory) ---------- */
const attempts = new Map();
function limited(ip, max = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  a.count += 1;
  return a.count > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts) if (a.resetAt < now) attempts.delete(ip);
}, 5 * 60 * 1000).unref();

/* ---------- routes ---------- */
const publicUser = (u) => ({
  name: u.username,
  email: u.email,
  gender: u.gender,
  avatar: u.avatar || "👤",
});

function requireAuth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const username = m && verifyToken(m[1]);
  if (!username) return res.status(401).json({ error: "Please log in" });
  req.username = username;
  next();
}

function registerAuthRoutes(app, { onNewMember } = {}) {
  const json = express.json({ limit: "10kb" });

  app.post("/api/auth/signup", json, async (req, res) => {
    try {
      if (limited(req.ip, 20)) {
        return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
      }
      const body = req.body || {};
      const problem = validateSignup(body);
      if (problem) return res.status(400).json({ error: problem });

      const username = cleanName(body.username);
      const email = String(body.email).trim().toLowerCase();
      const gender = body.gender || null;

      const created = await db.createAccount({
        username,
        email,
        gender,
        passwordHash: await hashPassword(body.password),
      });
      if (created.error) return res.status(409).json({ error: created.error });

      if (onNewMember) await onNewMember(created.user);
      res.status(201).json({ token: signToken(created.user.username), user: publicUser(created.user) });
    } catch (err) {
      console.error("signup failed:", err.message);
      res.status(500).json({ error: "Could not create the account" });
    }
  });

  app.post("/api/auth/login", json, async (req, res) => {
    try {
      if (limited(req.ip)) {
        return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
      }
      const { identifier, password } = req.body || {};
      if (!identifier || typeof password !== "string") {
        return res.status(400).json({ error: "Enter your name or email and your password" });
      }

      const user = await db.findAccount(identifier);
      const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
      if (!user || !user.password_hash || !ok) {
        return res.status(401).json({ error: "Wrong name/email or password" });
      }
      res.json({ token: signToken(user.username), user: publicUser(user) });
    } catch (err) {
      console.error("login failed:", err.message);
      res.status(500).json({ error: "Could not log in" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await db.findAccount(req.username);
      if (!user) return res.status(401).json({ error: "Please log in" });
      res.json({ user: publicUser(user) });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });
}

module.exports = { registerAuthRoutes, requireAuth, verifyToken, hashPassword, verifyPassword, validateSignup };