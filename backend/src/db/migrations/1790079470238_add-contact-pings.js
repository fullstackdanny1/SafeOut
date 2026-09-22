export const up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS contact_pings (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
};
export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS contact_pings;`);
};
