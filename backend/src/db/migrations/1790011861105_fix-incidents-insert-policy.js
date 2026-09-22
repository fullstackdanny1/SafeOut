export const up = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS incidents_insert_open ON incidents;
    CREATE POLICY incidents_insert_open ON incidents
      FOR INSERT
      WITH CHECK (true);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP POLICY IF EXISTS incidents_insert_open ON incidents;`);
};
