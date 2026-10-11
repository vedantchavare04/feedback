import { neon } from "@neondatabase/serverless";

/* Accepts the value the way people actually paste it from Neon:
   psql 'postgresql://...'   "postgresql://..."   trailing spaces/newlines   &channel_binding=require */
export function normalizeDbUrl(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^psql\s+/i, "").trim();
  s = s.replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  s = s.replace(/([?&])channel_binding=[^&]*&?/i, "$1").replace(/[?&]$/, "");
  return s;
}

export function getSql() {
  const url = normalizeDbUrl(process.env.DATABASE_URL);
  return url ? neon(url) : null;
}

export function classifyDbError(e) {
  const m = `${e?.message || e} ${e?.code || ""} ${e?.sourceError?.message || ""}`;
  if (/connection string|Invalid URL|must start with|invalid.*url/i.test(m)) return "DB_URL";
  if (/password authentication failed|authentication failed|no pg_hba/i.test(m)) return "DB_AUTH";
  if (/database ".*" does not exist/i.test(m)) return "DB_NAME";
  if (/relation .* does not exist|table .* does not exist/i.test(m)) return "DB_TABLE";
  if (/permission denied/i.test(m)) return "DB_PERMISSION";
  if (/ENOTFOUND|getaddrinfo|fetch failed|Failed to fetch|ECONNREFUSED|ETIMEDOUT|Error connecting/i.test(m)) return "DB_CONNECT";
  return "DB_ERROR";
}

export const DB_HINTS = {
  DB_URL: "DATABASE_URL is not a valid Postgres connection string. Paste only the postgresql://... value from Neon.",
  DB_AUTH: "Neon rejected the username or password. Copy the connection string again from Neon (Connect), then update it in Vercel and redeploy.",
  DB_NAME: "The database name in DATABASE_URL does not exist. Copy the connection string again from the Neon dashboard.",
  DB_TABLE: "The feedback table is missing. Run schema.sql in the Neon SQL Editor.",
  DB_PERMISSION: "This Neon role cannot create tables. Use the default owner role's connection string, or run schema.sql yourself.",
  DB_CONNECT: "The function could not reach the database. Check the host in DATABASE_URL and that the Neon project exists and is not paused or deleted.",
  DB_ERROR: "Unexpected database error. Check Vercel > Logs for the line starting 'Feedback error'."
};
