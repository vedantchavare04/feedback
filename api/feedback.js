import { getSql, classifyDbError } from "../lib/db.js";
import { Resend } from "resend";
import { createHash } from "node:crypto";

const PROJECTS = { tourmate: "Tourmate.ai", solo2squad: "Solo2Squad", groupfinder: "Group Finder", general: "General" };
const CATEGORIES = { bug: "Bug", idea: "Idea", praise: "Praise", other: "Other" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

let ready; /* creates the table once per warm function instance */
const ensureTable = (sql) => (ready ||= (async () => {
  await sql`CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY, project TEXT NOT NULL, category TEXT NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5), message TEXT NOT NULL,
    name TEXT, email TEXT, may_contact BOOLEAN NOT NULL DEFAULT false, referrer TEXT, user_agent TEXT,
    ip_hash TEXT, emailed BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS feedback_ip_idx ON feedback (ip_hash, created_at DESC)`;
})().catch((e) => { ready = null; throw e; }));

/* CORS: lets the page on Live Server (or another site) call a deployed API. Same-origin needs none. */
function cors(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || "http://127.0.0.1:5500,http://localhost:5500").split(",").map((s) => s.trim());
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
  const { DATABASE_URL, RESEND_API_KEY, FEEDBACK_TO_EMAIL, FEEDBACK_FROM_EMAIL, SEND_CONFIRMATION, IP_SALT } = process.env;
  if (!DATABASE_URL) { console.error("DATABASE_URL is not set"); return res.status(500).json({ error: "Feedback is not configured yet.", code: "NO_DATABASE_URL" }); }

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (b.website) return res.status(200).json({ ok: true }); /* honeypot: bots fill hidden fields */

  const project = clean(b.project, 20), category = clean(b.category, 20), rating = Number(b.rating);
  const message = clean(b.message, 2000), name = clean(b.name, 80), email = clean(b.email, 254).toLowerCase();
  const mayContact = b.mayContact === true && !!email;
  const fields = {};
  if (!PROJECTS[project]) fields.project = "Choose a product.";
  if (!CATEGORIES[category]) fields.category = "Choose a type.";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = "Choose a rating.";
  if (message.length < 10) fields.message = "Please write at least 10 characters.";
  if (email && !EMAIL_RE.test(email)) fields.email = "That email address does not look right.";
  if (Object.keys(fields).length) return res.status(400).json({ error: "Please check the highlighted fields.", fields });

  try {
    const sql = getSql();
    await ensureTable(sql);

    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const ipHash = createHash("sha256").update(ip + (IP_SALT || "")).digest("hex").slice(0, 32);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM feedback WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour'`;
    if (n >= 5) return res.status(429).json({ error: "You have sent several messages recently. Please try again in an hour." });

    const referrer = clean(b.referrer, 300), ua = clean(req.headers["user-agent"], 300);
    const [row] = await sql`INSERT INTO feedback (project, category, rating, message, name, email, may_contact, referrer, user_agent, ip_hash)
      VALUES (${project}, ${category}, ${rating}, ${message}, ${name || null}, ${email || null}, ${mayContact}, ${referrer || null}, ${ua || null}, ${ipHash})
      RETURNING id, created_at`;

    let emailed = false;
    if (RESEND_API_KEY && FEEDBACK_TO_EMAIL) {
      try {
        const resend = new Resend(RESEND_API_KEY), from = FEEDBACK_FROM_EMAIL || "Tourmate Feedback <onboarding@resend.dev>";
        const line = (k, v) => `<tr><td style="padding:6px 16px 6px 0;color:#667;vertical-align:top">${k}</td><td style="padding:6px 0">${v}</td></tr>`;
        const { error } = await resend.emails.send({
          from, to: FEEDBACK_TO_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
          replyTo: email || undefined,
          subject: `[${PROJECTS[project]}] ${CATEGORIES[category]} feedback, ${rating}/5`,
          html: `<div style="font:15px/1.6 Arial,sans-serif;color:#16201d"><h2 style="margin:0 0 12px">New feedback #${row.id}</h2>
            <table style="border-collapse:collapse">${line("Product", esc(PROJECTS[project]))}${line("Type", esc(CATEGORIES[category]))}${line("Rating", `${rating} / 5`)}
            ${line("From", esc(name || "Anonymous") + (email ? ` &lt;${esc(email)}&gt;` : ""))}${line("May contact", mayContact ? "Yes" : "No")}${line("Came from", esc(referrer || "Direct"))}</table>
            <p style="margin:18px 0 6px;color:#667">Message</p><div style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">${esc(message)}</div></div>`
        });
        if (error) throw new Error(error.message);
        emailed = true;
        if (SEND_CONFIRMATION === "true" && email) {
          await resend.emails.send({ from, to: [email], subject: "We got your feedback",
            html: `<p style="font:15px/1.6 Arial,sans-serif">Thanks${name ? ", " + esc(name) : ""}. Your feedback on ${esc(PROJECTS[project])} reached us (reference #${row.id}).</p>` }).catch((e) => console.error("confirmation failed", e));
        }
        await sql`UPDATE feedback SET emailed = true WHERE id = ${row.id}`;
      } catch (e) { console.error("Email failed (feedback is saved):", e.message); }
    }
    return res.status(200).json({ ok: true, id: Number(row.id), emailed });
  } catch (e) {
    const code = classifyDbError(e);
    console.error(`Feedback error [${code}]:`, e?.message || e);
    return res.status(500).json({ error: "Something went wrong saving your feedback.", code });
  }
}
