-- Meeting table schema for Firebase Cloud SQL / PostgreSQL.

CREATE TABLE IF NOT EXISTS "meeting" (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "date" TIMESTAMP NOT NULL,
  minutes_document_id UUID REFERENCES "document"(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meeting_date ON "meeting" ("date");
