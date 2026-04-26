import { DataSource } from 'typeorm'

const DUMMY_DRIVER_NAME = 'سائق افتراضي'

/**
 * Pre-sync migration: ensures every existing trip has a driver_id before TypeORM's
 * synchronize tries to mark trips.driverId NOT NULL. Idempotent and safe to call on
 * every boot — both schema and data steps check existence first.
 *
 * Steps:
 *   1. Create the drivers table if missing (so we can FK from trips).
 *   2. Add trips.driverId as nullable if missing.
 *   3. For each company that has trips with NULL driverId, insert one
 *      "سائق افتراضي" driver and backfill those trips.
 *   4. Delete any drivers whose companyId no longer exists in companies, then
 *      enforce drivers.companyId → companies(id) at the schema level so the
 *      orphan state can't recur. (Fixes Railway 2026-04-26: stale-JWT inserts
 *      had been creating orphan drivers because this FK was missing.)
 *
 * After this runs, synchronize can safely ALTER trips.driverId to NOT NULL because
 * every existing row now has a value.
 */
export async function ensureDriversBackfilled(): Promise<void> {
    const url = process.env.DATABASE_URL
    if (!url) return

    const ds = new DataSource({ type: 'postgres', url, synchronize: false, entities: [] })
    await ds.initialize()
    try {
        const tripsExists = await tableExists(ds, 'trips')
        if (!tripsExists) return

        await ds.query(`
            CREATE TABLE IF NOT EXISTS "drivers" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "companyId" uuid NOT NULL,
                "nameAr" varchar NOT NULL,
                "deletedAt" timestamptz NULL,
                "createdAt" timestamptz NOT NULL DEFAULT now()
            )
        `)

        await ds.query(`ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "driverId" uuid NULL`)

        const companies: Array<{ companyId: string }> = await ds.query(
            `SELECT DISTINCT "companyId" FROM "trips" WHERE "driverId" IS NULL`
        )

        for (const { companyId } of companies) {
            const existing: Array<{ id: string }> = await ds.query(
                `SELECT "id" FROM "drivers" WHERE "companyId" = $1 AND "nameAr" = $2 AND "deletedAt" IS NULL LIMIT 1`,
                [companyId, DUMMY_DRIVER_NAME]
            )
            let driverId = existing[0]?.id
            if (!driverId) {
                const inserted: Array<{ id: string }> = await ds.query(
                    `INSERT INTO "drivers" ("companyId", "nameAr") VALUES ($1, $2) RETURNING "id"`,
                    [companyId, DUMMY_DRIVER_NAME]
                )
                driverId = inserted[0]!.id
            }
            await ds.query(`UPDATE "trips" SET "driverId" = $1 WHERE "companyId" = $2 AND "driverId" IS NULL`, [
                driverId,
                companyId,
            ])
        }

        if (await tableExists(ds, 'companies')) {
            await ds.query(`DELETE FROM "drivers" WHERE "companyId" NOT IN (SELECT "id" FROM "companies")`)
            const fkExists: Array<{ exists: boolean }> = await ds.query(
                `SELECT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.drivers'::regclass
                      AND contype = 'f'
                      AND conkey = (
                          SELECT array_agg(attnum) FROM pg_attribute
                          WHERE attrelid = 'public.drivers'::regclass AND attname = 'companyId'
                      )
                ) AS exists`
            )
            if (!fkExists[0]?.exists) {
                await ds.query(
                    `ALTER TABLE "drivers" ADD CONSTRAINT "fk_drivers_company"
                     FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT`
                )
            }
        }
    } finally {
        await ds.destroy()
    }
}

async function tableExists(ds: DataSource, table: string): Promise<boolean> {
    const rows: Array<{ reg: string | null }> = await ds.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`])
    return Boolean(rows[0]?.reg)
}
