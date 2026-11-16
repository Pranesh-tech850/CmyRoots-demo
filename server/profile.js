const express = require("express");
const db = require("./db");
const { requireAuth } = require("./auth");
const {
  MAX_IMAGE_BYTES,
  MAX_FILE_BYTES,
  saveImage,
  inspectFile,
  writeFile,
  removeFile,
} = require("./uploads");

const json = express.json({ limit: "10kb" });

/* raw upload body (the file bytes). Too big / unreadable -> a JSON error, not an HTML page */
const rawBody = (limit) => (req, res, next) =>
  express.raw({ type: () => true, limit })(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.type === "entity.too.large";
    res
      .status(tooBig ? 413 : 400)
      .json({ error: tooBig ? "That file is too big" : "Could not read the upload" });
  });

/* ---------------- validation ---------------- */

const GENDERS = ["male", "female", "other"];
const MAX_TEXT = 120;

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validateProfile(body) {
  const b = body || {};
  const fields = {};
  const v = {
    fullName: text(b.fullName),
    dateOfBirth: text(b.dateOfBirth),
    birthplace: text(b.birthplace),
    dateOfPassing: text(b.dateOfPassing),
    placeOfPassing: text(b.placeOfPassing),
    gender: text(b.gender).toLowerCase(),
    occupation: text(b.occupation),
    nationality: text(b.nationality),
  };

  // one day of slack so a person ahead of the server's time zone is not refused
  const latest = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (!v.fullName) fields.fullName = "Full name is required";
  else if (v.fullName.length < 2) fields.fullName = "Full name is too short";

  if (!v.dateOfBirth) fields.dateOfBirth = "Date of birth is required";
  else if (!isRealDate(v.dateOfBirth)) fields.dateOfBirth = "Enter a valid date";
  else if (v.dateOfBirth < "1800-01-01" || v.dateOfBirth > latest) {
    fields.dateOfBirth = "Enter a date of birth that is not in the future";
  }

  if (v.dateOfPassing) {
    if (!isRealDate(v.dateOfPassing)) fields.dateOfPassing = "Enter a valid date";
    else if (v.dateOfPassing > latest) fields.dateOfPassing = "Date of passing cannot be in the future";
    else if (!fields.dateOfBirth && v.dateOfPassing < v.dateOfBirth) {
      fields.dateOfPassing = "Date of passing cannot be before the date of birth";
    }
  }

  if (!v.gender) fields.gender = "Please choose a gender";
  else if (!GENDERS.includes(v.gender)) fields.gender = "Please choose a gender from the list";

  for (const key of ["fullName", "birthplace", "placeOfPassing", "occupation", "nationality"]) {
    if (!fields[key] && v[key].length > MAX_TEXT) {
      fields[key] = `Too long (max ${MAX_TEXT} characters)`;
    }
  }

  return { values: v, fields };
}

function readFileName(req) {
  const raw = String(req.headers["x-file-name"] || "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/* ---------------- routes ---------------- */

function registerProfileRoutes(app) {
  const withUser = async (req, res, next) => {
    try {
      const id = await db.getUserId(req.username);
      if (!id) return res.status(401).json({ error: "Please log in" });
      req.userId = id;
      next();
    } catch (err) {
      console.error("🐘 profile: could not find the account:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  };

  const fail = (res, label, err) => {
    console.error(`🐘 ${label}:`, err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  };

  /* ---- my profile ---- */
  app.get("/api/profile", requireAuth, withUser, async (req, res) => {
    try {
      res.json({ profile: await db.getProfile(req.userId) });
    } catch (err) {
      fail(res, "could not load profile", err);
    }
  });

  app.put("/api/profile", requireAuth, withUser, json, async (req, res) => {
    try {
      const { values, fields } = validateProfile(req.body);
      if (Object.keys(fields).length) {
        return res.status(400).json({ error: "Please fix the highlighted fields", fields });
      }

      let profile = await db.saveProfile(req.userId, values);

      if (req.body && req.body.removePhoto === true && profile.photoUrl) {
        const cleared = await db.setProfilePhoto(req.userId, null);
        if (cleared) {
          profile = cleared.profile;
          removeFile(cleared.oldUrl);
        }
      }
      res.json({ profile });
    } catch (err) {
      fail(res, "could not save profile", err);
    }
  });

  app.post(
    "/api/profile/picture",
    requireAuth,
    withUser,
    rawBody(MAX_IMAGE_BYTES + 1024),
    async (req, res) => {
      let url = null;
      try {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ error: "Please choose an image" });
        }
        if (!(await db.getProfile(req.userId))) {
          return res.status(409).json({ error: "Create your profile first" });
        }

        const saved = await saveImage(req.body);
        if (saved.error) return res.status(400).json({ error: saved.error });
        url = saved.url;

        const result = await db.setProfilePhoto(req.userId, url);
        if (!result) {
          removeFile(url);
          return res.status(409).json({ error: "Create your profile first" });
        }
        removeFile(result.oldUrl);
        res.json({ profile: result.profile });
      } catch (err) {
        if (url) removeFile(url);
        fail(res, "could not save picture", err);
      }
    }
  );

  /* ---- photos & documents ---- */
  app.get("/api/profile/media", requireAuth, withUser, async (req, res) => {
    try {
      res.json(await db.getMedia(req.username, req.userId));
    } catch (err) {
      fail(res, "could not load media", err);
    }
  });

  app.post(
    "/api/profile/files",
    requireAuth,
    withUser,
    rawBody(MAX_FILE_BYTES + 1024),
    async (req, res) => {
      let url = null;
      try {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ error: "Please choose a file" });
        }

        const kinds = req.query.type === "document" ? ["document"] : ["image", "video"];
        const info = inspectFile(req.body, readFileName(req), { kinds });
        if (info.error) return res.status(400).json({ error: info.error });

        if (await db.hasMyFile(req.username, req.userId, info.hash)) {
          return res.status(409).json({ error: "This file is already in your library" });
        }

        url = await writeFile(info);
        const item = await db.addProfileFile(req.userId, {
          kind: info.kind,
          url,
          name: info.name,
          mime: info.mime,
          size: info.size,
          hash: info.hash,
        });
        if (!item) {
          removeFile(url);
          return res.status(409).json({ error: "This file is already in your library" });
        }
        res.status(201).json({ item });
      } catch (err) {
        if (url) removeFile(url);
        fail(res, "could not save file", err);
      }
    }
  );
}

module.exports = { registerProfileRoutes, validateProfile };