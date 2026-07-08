-- SCRUM-190: Polling schema for Firebase Cloud SQL / PostgreSQL.
-- Run with a database role that is allowed to create tables in the public schema.

CREATE TABLE IF NOT EXISTS "poll" (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closes_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "vote" (
  id UUID PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES "poll"(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  selected_option TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_vote_poll_user UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vote_poll_id ON "vote" (poll_id);
