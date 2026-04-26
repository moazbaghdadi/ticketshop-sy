import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'

declare global {
    var __TC_PG__: StartedPostgreSqlContainer | undefined
}

export default async function globalSetup(): Promise<void> {
    const container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('ticketshop_test')
        .withUsername('postgres')
        .withPassword('postgres')
        .start()

    process.env.DATABASE_URL = container.getConnectionUri()
    process.env.NODE_ENV = 'development' // keep TypeORM `synchronize: true` so schema is created from entities
    process.env.JWT_SECRET = 'e2e-test-secret-please-do-not-use-in-prod'
    process.env.JWT_EXPIRES_IN = '1h'
    process.env.DASHBOARD_BASE_URL = 'http://localhost:4201'

    globalThis.__TC_PG__ = container
}
