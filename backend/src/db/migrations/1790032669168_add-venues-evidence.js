export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE venues (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      type       TEXT,
      city       TEXT NOT NULL,
      latitude   NUMERIC,
      longitude  NUMERIC,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE qrcodes ADD COLUMN venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL;

    CREATE TABLE evidence (
      id           SERIAL PRIMARY KEY,
      incident_id  INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      file_type    TEXT NOT NULL CHECK (file_type IN ('photo', 'audio')),
      storage_url  TEXT NOT NULL,
      legal_hold   BOOLEAN NOT NULL DEFAULT false,
      uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ
    );

    CREATE INDEX idx_evidence_incident_id ON evidence(incident_id);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS evidence;
    ALTER TABLE qrcodes DROP COLUMN IF EXISTS venue_id;
    DROP TABLE IF EXISTS venues;
  `);
};