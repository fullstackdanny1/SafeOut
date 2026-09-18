export const shorthands = undefined;

export const up = (pgm) => {
    pgm.sql(`
-- ============================================
-- dispatchers
-- ============================================
CREATE TABLE dispatchers (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'dispatcher'
                  CHECK (role IN ('dispatcher', 'super_admin')),
  city          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- qrcodes
-- ============================================
CREATE TABLE qrcodes (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  venue_name  TEXT,
  placement   TEXT,
  city        TEXT NOT NULL,
  latitude    NUMERIC,
  longitude   NUMERIC,
  scans       INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- incidents
-- ============================================
CREATE TABLE incidents (
  id                   SERIAL PRIMARY KEY,
  situation_type       TEXT NOT NULL
                         CHECK (situation_type IN ('emergency', 'escort', 'contact')),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  city                 TEXT NOT NULL,

  qr_code_id           INTEGER REFERENCES qrcodes(id) ON DELETE SET NULL,
  venue_name           TEXT,
  placement            TEXT,

  latitude             NUMERIC,
  longitude            NUMERIC,
  location_accuracy_m  NUMERIC,
  location_method      TEXT
                         CHECK (location_method IN ('gps', 'wifi', 'qr_fixed')),
  live_tracking        BOOLEAN NOT NULL DEFAULT false,

  victim_message       TEXT,
  notes                TEXT,

  dispatcher_id        INTEGER REFERENCES dispatchers(id) ON DELETE SET NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at      TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ
);

CREATE INDEX idx_incidents_city ON incidents(city);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_qr_code_id ON incidents(qr_code_id);

-- ============================================
-- audit_log
-- ============================================
CREATE TABLE audit_log (
  id            SERIAL PRIMARY KEY,
  dispatcher_id INTEGER REFERENCES dispatchers(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_dispatcher_id ON audit_log(dispatcher_id);
`);
};

export const down = (pgm) => {
    pgm.sql(`
    DROP TABLE IF EXISTS incidents;
    DROP TABLE IF EXISTS qrcodes;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS dispatchers;
    `);
};


