import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module'
import { GlobalExceptionFilter } from '../../src/common/filters/http-exception.filter'

export interface TestApp {
    app: INestApplication
    dataSource: DataSource
    close(): Promise<void>
}

export async function createTestApp(): Promise<TestApp> {
    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
    }).compile()

    const app = moduleRef.createNestApplication({ logger: false })
    app.setGlobalPrefix('api/v1')
    app.useGlobalFilters(new GlobalExceptionFilter())
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
        })
    )
    await app.init()

    const dataSource = app.get(DataSource)

    return {
        app,
        dataSource,
        close: async () => {
            await app.close()
        },
    }
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
    // Order matters because of FKs; truncate child tables first.
    // Using TRUNCATE … RESTART IDENTITY CASCADE makes inter-test cleanup deterministic.
    const tables = [
        'cancelled_trip_dismissals',
        'bookings',
        'trip_segment_prices',
        'trip_stations',
        'trips',
        'invitations',
        'users',
        'companies',
    ]
    await dataSource.query(`TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`)
}
