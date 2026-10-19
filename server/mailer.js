/* =========================================================
   server/mailer.js

   Sends the "relationship request" email.

   Configure in server/.env (see .env.example):
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM

   DEV MODE: if SMTP is not configured, or the address is an
   @example.com demo address, nothing is sent. The link is
   printed in the server console instead so you can test.
========================================================= */

try {
  require("dotenv").config();
} catch {
  /* dotenv is optional; env vars can also come from the shell */
  console.log("DOTENV file is not found, continuing with shell environment variables");
}

const nodemailer = require("nodemailer");

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

const configured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
const port = Number(SMTP_PORT || 587);

const transporter = configured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

if (!configured) {
  console.log(
    "✉️  SMTP not configured -> emails will be printed in this console (dev mode)"
  );
}

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const isDemoAddress = (addr) => /@example\.(com|org|net)$/i.test(addr);

async function sendMail({ to, subject, text, html }) {
  if (!transporter || isDemoAddress(to)) {
    console.log(
      `\n✉️  [DEV MODE] email NOT sent (${
        !transporter ? "no SMTP configured" : "demo @example.com address"
      })\n   to: ${to}\n   subject: ${subject}\n${text}\n`
    );
    return { dev: true };
  }
  await transporter.sendMail({
    from: MAIL_FROM || SMTP_USER,
    to,
    subject,
    text,
    html,
  });
  return { dev: false };
}

/* the email the recipient receives */
function sendRequestEmail({
  to,
  toName,
  fromName,
  fromEmail,
  subjectName,
  relation,
  link,
}) {
  const who = fromEmail ? `${fromName} (${fromEmail})` : fromName;
  /* "their Mother"  or, for a grandparent, "Robert's Father" */
  const whose = subjectName ? `${subjectName}'s` : "their";
  const subject = `${fromName} wants to connect with you on CmyRoots`;

  const text =
    `Hi ${toName || ""},\n\n` +
    `${who} says you are ${whose} ${relation}.\n\n` +
    `If you know this person, open the link below and press Accept.\n` +
    `If you don't know them, just ignore this email - nothing will be added.\n\n` +
    `${link}\n\n` +
    `This link expires in 7 days.\n`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
    <h2 style="margin-top:0">Family connection request</h2>
    <p><strong>${esc(who)}</strong> says you are ${esc(whose)} <strong>${esc(relation)}</strong>.</p>
    <p>Is this person your connection?</p>
    <p style="margin:24px 0">
      <a href="${esc(link)}"
         style="background:#111;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">
        Review request
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px">
      Nothing is added to the family tree unless you accept.
      If you don't know this person, ignore this email. The link expires in 7 days.
    </p>
  </div>`;

  return sendMail({ to, subject, text, html });
}

module.exports = { sendRequestEmail };