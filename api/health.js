import { getSql, classifyDbError, DB_HINTS } from "../lib/db.js";

/* Open /api/health after deploying. It reports what is configured and whether Neon is reachable.
   It never returns secret values. */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const e = process.env;
  const env = { DATABASE_URL: !!e.DATABASE_URL, RESEND_API_KEY: !!e.RESEND_API_KEY, FEEDBACK_TO_EMAIL: !!e.FEEDBACK_TO_EMAIL, FEEDBACK_FROM_EMAIL: !!e.FEEDBACK_FROM_EMAIL };
  const out = {
    env, node: process.version,
    database: { status: env.DATABASE_URL ? "checking" : "missing", hint: env.DATABASE_URL ? undefined : "Add DATABASE_URL in Vercel > Settings > Environment Variables (Production), then redeploy." },
    email: env.RESEND_API_KEY && env.FEEDBACK_TO_EMAIL ? { status: "configured" } : { status: "missing", hint: "Add RESEND_API_KEY and FEEDBACK_TO_EMAIL. Feedback is still saved without them." }
  };
  if (env.DATABASE_URL) {
    try {
      const sql = getSql();
      await sql`SELECT 1`;
      const [t] = await sql`SELECT to_regclass('public.feedback') IS NOT NULL AS ok`;
      out.database = { status: "ok", table: t.ok ? "exists" : "will be created on the first submission" };
    } catch (err) {
      const code = classifyDbError(err);
      console.error(`Health check failed [${code}]:`, err?.message);
      out.database = { status: "error", code, hint: DB_HINTS[code] };
    }
  }
  out.ok = out.database.status === "ok";
  return res.status(out.ok ? 200 : 503).json(out);
}
