-- Optional: the API creates this automatically on first use. Run it yourself in the Neon SQL Editor if you prefer.
CREATE TABLE IF NOT EXISTS feedback (
  id          BIGSERIAL PRIMARY KEY,
  project     TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  rating      SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message     TEXT        NOT NULL,
  name        TEXT,
  email       TEXT,
  may_contact BOOLEAN     NOT NULL DEFAULT false,
  referrer    TEXT,
  user_agent  TEXT,
  ip_hash     TEXT,
  emailed     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_ip_idx ON feedback (ip_hash, created_at DESC);
