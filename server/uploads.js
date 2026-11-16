const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "uploads");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // videos and documents

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const VIDEO_MIME = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};
const DOC_MIME = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  csv: "text/csv",
};

/* every extension this server will ever write (used by removeFile) */
const STORED_EXTS = [
  ...Object.keys(IMAGE_MIME),
  ...Object.keys(VIDEO_MIME),
  ...Object.keys(DOC_MIME),
];
const STORED_NAME_RE = new RegExp(`^[a-f0-9]{32}\\.(${STORED_EXTS.join("|")})$`);

/* ---------------- file type detection (first bytes) ---------------- */

const startsWithBytes = (buf, bytes) =>
  buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

function detectImageType(buf) {
  const ascii = (from, to) => buf.subarray(from, to).toString("ascii");

  if (startsWithBytes(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWithBytes(buf, [0xff, 0xd8, 0xff])) return "jpg";
  if (buf.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "gif";
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/* "ftyp" brands that are real MP4 / QuickTime videos (not HEIC photos or M4A audio) */
const MP4_BRANDS = new Set([
  "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V ", "MSNV",
]);

function detectVideoType(buf, ext) {
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand === "qt  ") return "mov";
    if (MP4_BRANDS.has(brand)) return "mp4";
    return null;
  }
  // WEBM (EBML header). Matroska uses the same header, so the name must say .webm
  if (startsWithBytes(buf, [0x1a, 0x45, 0xdf, 0xa3]) && ext === "webm") return "webm";
  return null;
}

const ZIP_DOCS = new Set(["docx", "xlsx", "pptx", "odt", "ods", "odp"]);
const OLE_DOCS = new Set(["doc", "xls", "ppt"]);

function detectDocumentType(buf, ext) {
  if (!DOC_MIME[ext]) return null;

  if (ext === "pdf") {
    return buf.subarray(0, 1024).includes("%PDF-") ? "pdf" : null;
  }
  if (ZIP_DOCS.has(ext)) {
    return startsWithBytes(buf, [0x50, 0x4b, 0x03, 0x04]) ? ext : null;
  }
  if (OLE_DOCS.has(ext)) {
    return startsWithBytes(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) ? ext : null;
  }
  if (ext === "rtf") {
    return buf.subarray(0, 5).toString("ascii") === "{\\rtf" ? "rtf" : null;
  }
  // txt / csv: plain text must not contain NUL bytes
  return buf.subarray(0, 8192).includes(0) ? null : ext;
}

/* ---------------- helpers ---------------- */

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

/* the name shown to people: no folders, no control characters, max 120 characters */
function cleanFileName(name) {
  const base = String(name || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split(/[\\/]/)
    .pop()
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(base).slice(0, 120).join("");
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const KIND_LABELS = {
  image: "photos: PNG, JPG, GIF, WEBP",
  video: "videos: MP4, MOV, WEBM",
  document: "documents: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, TXT, CSV, RTF",
};

async function writeBuffer(buf, ext) {
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buf, { flag: "wx" });
  return `/uploads/${name}`;
}

/* ---------------- images (used by chat, unchanged behaviour) ---------------- */

async function saveImage(data) {
  const buf = toBuffer(data);
  if (!buf) return { error: "That is not a valid image" };

  if (buf.length === 0) return { error: "That image is empty" };
  if (buf.length > MAX_IMAGE_BYTES) return { error: "Image is too big (max 5 MB)" };

  const ext = detectImageType(buf);
  if (!ext) return { error: "Only PNG, JPG, GIF or WEBP images are allowed" };

  const url = await writeBuffer(buf, ext);
  return { url, hash: sha256(buf), size: buf.length, mime: IMAGE_MIME[ext] };
}

/* ---------------- any allowed file (videos, documents, photos) ---------------- */

function inspectFile(data, originalName, { kinds = ["image", "video", "document"] } = {}) {
  const buf = toBuffer(data);
  if (!buf) return { error: "That is not a valid file" };
  if (buf.length === 0) return { error: "That file is empty" };
  if (buf.length > MAX_FILE_BYTES) return { error: "File is too big (max 25 MB)" };

  const name = cleanFileName(originalName);
  const ext = path.extname(name).slice(1).toLowerCase();

  let found = null;
  const img = detectImageType(buf);
  if (img) {
    found = { kind: "image", ext: img, mime: IMAGE_MIME[img] };
  } else {
    const vid = detectVideoType(buf, ext);
    if (vid) {
      found = { kind: "video", ext: vid, mime: VIDEO_MIME[vid] };
    } else {
      const doc = detectDocumentType(buf, ext);
      if (doc) found = { kind: "document", ext: doc, mime: DOC_MIME[doc] };
    }
  }

  if (!found || !kinds.includes(found.kind)) {
    return { error: `Not allowed. Allowed ${kinds.map((k) => KIND_LABELS[k]).join("; ")}` };
  }
  if (found.kind === "image" && buf.length > MAX_IMAGE_BYTES) {
    return { error: "Image is too big (max 5 MB)" };
  }

  return {
    buf,
    name: name || `${found.kind === "image" ? "Photo" : "File"}.${found.ext}`,
    ...found,
    size: buf.length,
    hash: sha256(buf),
  };
}

const writeFile = (info) => writeBuffer(info.buf, info.ext);

async function saveFile(data, originalName, options) {
  const info = inspectFile(data, originalName, options);
  if (info.error) return { error: info.error };
  const url = await writeFile(info);
  return { url, name: info.name, kind: info.kind, mime: info.mime, size: info.size, hash: info.hash };
}

function removeFile(url) {
  const name = path.basename(String(url || ""));
  if (!STORED_NAME_RE.test(name)) return;
  fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
}

module.exports = {
  UPLOAD_DIR,
  MAX_IMAGE_BYTES,
  MAX_FILE_BYTES,
  IMAGE_MIME,
  saveImage,
  saveFile,
  inspectFile,
  writeFile,
  removeFile,
  removeImage: removeFile, // old name, still used by server.js
};