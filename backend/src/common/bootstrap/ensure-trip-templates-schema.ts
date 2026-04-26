import { DataSource } from 'typeorm'

/**
 * Pre-sync migration: creates the trip-templates tables if they don't exist.
 * The trip-templates feature was introduced after `synchronize` was disabled in
 * production, so the tables were never auto-created on Railway and every query
 * to `/dashboard/trip-templates` was 500ing with `relation "trip_templates"
 * does not exist`.
 *
 * Idempotent and safe to call on every boot. Mirrors what TypeORM `synchronize`
 * would produce for the three entities (trip-template.entity.ts,
 * trip-template-station.entity.ts, trip-template-segment-price.entity.ts).
 */
export async function ensureTripTemplatesSchema(): Promise<void> {
    const url = process.env.DATABASE_URL
    if (!url) return

    const ds = new DataSource({ type: 'postgres', url, synchronize: false, entities: [] })
    await ds.initialize()
    try {
        // FK targets must exist; if the deployment is brand-new and these are missing,
        // skip — the next boot (after synchronize on dev or other bootstrap helpers run)
        // will satisfy the precondition.
        if (!(await tableExists(ds, 'companies')) || !(await tableExists(ds, 'drivers'))) return

        await ds.query(`
            CREATE TABLE IF NOT EXISTS "trip_templates" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "companyId" uuid NOT NULL,
                "nameAr" varchar NOT NULL,
                "driverId" uuid NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "fk_trip_templates_company"
                    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_trip_templates_driver"
                    FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT
            )
        `)
        await ds.query(`CREATE INDEX IF NOT EXISTS "ix_trip_templates_company" ON "trip_templates" ("companyId")`)
        await ds.query(`CREATE INDEX IF NOT EXISTS "ix_trip_templates_driver" ON "trip_templates" ("driverId")`)

        await ds.query(`
            CREATE TABLE IF NOT EXISTS "trip_template_stations" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "templateId" uuid NOT NULL,
                "cityId" varchar NOT NULL,
                "order" int NOT NULL,
                "arrivalOffsetMin" int NOT NULL,
                "departureOffsetMin" int NOT NULL,
                CONSTRAINT "fk_trip_template_stations_template"
                    FOREIGN KEY ("templateId") REFERENCES "trip_templates"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_trip_template_station_order" UNIQUE ("templateId", "order"),
                CONSTRAINT "uq_trip_template_station_city" UNIQUE ("templateId", "cityId")
            )
        `)
        await ds.query(
            `CREATE INDEX IF NOT EXISTS "ix_trip_template_stations_template" ON "trip_template_stations" ("templateId")`
        )

        await ds.query(`
            CREATE TABLE IF NOT EXISTS "trip_template_segment_prices" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "templateId" uuid NOT NULL,
                "fromCityId" varchar NOT NULL,
                "toCityId" varchar NOT NULL,
                "price" int NOT NULL,
                CONSTRAINT "fk_trip_template_segment_prices_template"
                    FOREIGN KEY ("templateId") REFERENCES "trip_templates"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_trip_template_segment_pair" UNIQUE ("templateId", "fromCityId", "toCityId")
            )
        `)
        await ds.query(
            `CREATE INDEX IF NOT EXISTS "ix_trip_template_segment_prices_template" ON "trip_template_segment_prices" ("templateId")`
        )
    } finally {
        await ds.destroy()
    }
}

async function tableExists(ds: DataSource, table: string): Promise<boolean> {
    const rows: Array<{ reg: string | null }> = await ds.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`])
    return Boolean(rows[0]?.reg)
}
