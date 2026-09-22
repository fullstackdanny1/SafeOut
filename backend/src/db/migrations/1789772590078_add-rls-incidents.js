export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE incidents FORCE ROW LEVEL SECURITY;

    -- Oricine poate crea un incident (victima nu e autentificată ca dispecer)
    CREATE POLICY incidents_insert_open ON incidents
      FOR INSERT
      WITH CHECK (true);

    -- Un dispecer vede doar incidentele din orașul lui; super_admin vede tot
    CREATE POLICY incidents_select_by_city ON incidents
      FOR SELECT
      USING (
        current_setting('app.current_role', true) = 'super_admin'
        OR city = current_setting('app.current_city', true)
      );

    -- Un dispecer poate modifica (acknowledge/resolve) doar incidente din orașul lui
    CREATE POLICY incidents_update_by_city ON incidents
      FOR UPDATE
      USING (
        current_setting('app.current_role', true) = 'super_admin'
        OR city = current_setting('app.current_city', true)
      )
      WITH CHECK (
        current_setting('app.current_role', true) = 'super_admin'
        OR city = current_setting('app.current_city', true)
      );
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS incidents_update_by_city ON incidents;
    DROP POLICY IF EXISTS incidents_select_by_city ON incidents;
    DROP POLICY IF EXISTS incidents_insert_open ON incidents;
    ALTER TABLE incidents DISABLE ROW LEVEL SECURITY;
  `);
};
