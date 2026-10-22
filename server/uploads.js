/* =========================================================
   server/uploads.js

   Saves chat images on disk (server/uploads/) and gives back a URL.
   Only the URL (e.g. "/uploads/3f9a....png") is stored in PostgreSQL,
   never the image itself.

   Safety rules:
     - max 5 MB
     - the real file type is checked from the file's first bytes, NOT from
       the name or the type the browser claims (so a renamed .exe is refused)
     - only PNG, JPEG, GIF and WEBP (no SVG: SVG can contain scripts)
     - the file name is random, chosen by the server
========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "uploads");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* look at the first bytes of the file to find out what it really is */
function detectImageType(buf) {
  const starts = (bytes) => bytes.every((b, i) => buf[i] === b);
  const ascii = (from, to) => buf.subarray(from, to).toString("ascii");

  if (buf.length >= 8 && starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (buf.length >= 3 && starts([0xff, 0xd8, 0xff])) return "jpg";
  if (buf.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "gif";
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/* data = what the browser sent (Buffer / ArrayBuffer).
   Returns { url } on success or { error } with a message for the user. */
async function saveImage(data) {
  let buf;
  if (Buffer.isBuffer(data)) buf = data;
  else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) buf = Buffer.from(data.buffer || data);
  else return { error: "That is not a valid image" };

  if (buf.length === 0) return { error: "That image is empty" };
  if (buf.length > MAX_IMAGE_BYTES) return { error: "Image is too big (max 5 MB)" };

  const ext = detectImageType(buf);
  if (!ext) return { error: "Only PNG, JPG, GIF or WEBP images are allowed" };

  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buf, { flag: "wx" });
  return { url: `/uploads/${name}` };
}

/* delete an image file (used when its message is deleted).
   The name is checked first, so a bad value can never point outside the folder. */
function removeImage(url) {
  const name = path.basename(String(url || ""));
  if (!/^[a-f0-9]{32}\.(png|jpg|gif|webp)$/.test(name)) return;
  fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
}

module.exports = { UPLOAD_DIR, MAX_IMAGE_BYTES, saveImage, removeImage };