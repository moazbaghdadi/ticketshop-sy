import { DataSource } from 'typeorm'

/**
 * Pre-sync migration: ensures users.role and invitations.role exist and have no
 * NULLs before TypeORM's synchronize tries to mark them NOT NULL. Safe to call
 * on every boot — both steps are idempotent.
 *
 * Without this, deploying the role rework against a database that predates it
 * fails with `column "role" of relation "users" contains null values`, because
 * TypeORM cannot ALTER a populated column to NOT NULL until existing rows have
 * a value.
 */
export async function ensureRoleColumnBackfilled(): Promise<void> {
    const url = process.env.DATABASE_URL
    if (!url) return

    const ds = new DataSource({ type: 'postgres', url, synchronize: false, entities: [] })
    await ds.initialize()
    try {
        for (const table of ['users', 'invitations']) {
            const exists: Array<{ reg: string | null }> = await ds.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`])
            if (!exists[0]?.reg) continue
            await ds.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS role text`)
            await ds.query(`UPDATE "${table}" SET role = 'admin' WHERE role IS NULL`)
        }
    } finally {
        await ds.destroy()
    }
}
