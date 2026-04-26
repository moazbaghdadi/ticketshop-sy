import request from 'supertest'
import { IsNull } from 'typeorm'
import { DriverEntity } from '../src/features/drivers/entities/driver.entity'
import { TripEntity } from '../src/features/trips/entities/trip.entity'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import {
    createCompany,
    createDriver,
    createTrip,
    createUser,
    damascusHomsAleppoPrices,
    damascusHomsAleppoStations,
} from './setup/seed-helpers'

describe('Dashboard drivers (e2e)', () => {
    let testApp: TestApp

    beforeAll(async () => {
        testApp = await createTestApp()
    })

    afterAll(async () => {
        await testApp.close()
    })

    beforeEach(async () => {
        await truncateAll(testApp.dataSource)
    })

    async function setup(role: 'admin' | 'sales' = 'admin') {
        const company = await createCompany(testApp.dataSource, 'شركة')
        const user = await createUser(testApp.app, testApp.dataSource, {
            email: `${role}@test.com`,
            companyId: company.id,
            role,
        })
        return { company, user }
    }

    describe('POST /api/v1/dashboard/drivers', () => {
        it('creates a new driver and returns it', async () => {
            const { user } = await setup()
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/drivers')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ nameAr: 'أحمد' })

            expect(res.status).toBe(201)
            expect(res.body.data.id).toEqual(expect.any(String))
            expect(res.body.data.nameAr).toBe('أحمد')
        })

        it('idempotently returns the existing driver if name matches (case-insensitive trim)', async () => {
            const { user } = await setup()
            const a = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/drivers')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ nameAr: 'أحمد' })

            const b = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/drivers')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ nameAr: '  أحمد  ' })

            expect(a.body.data.id).toBe(b.body.data.id)
        })

        it('403 for sales role', async () => {
            const { user } = await setup('sales')
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/drivers')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ nameAr: 'أحمد' })
            expect(res.status).toBe(403)
        })

        it('400 on blank name', async () => {
            const { user } = await setup()
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/drivers')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ nameAr: '' })
            expect(res.status).toBe(400)
        })
    })

    describe('GET /api/v1/dashboard/drivers', () => {
        it('lists active drivers ordered by nameAr', async () => {
            const { company, user } = await setup()
            await createDriver(testApp.dataSource, company.id, 'محمد')
            await createDriver(testApp.dataSource, company.id, 'أحمد')

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/drivers')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.status).toBe(200)
            expect(res.body.data.map((d: { nameAr: string }) => d.nameAr)).toEqual(['أحمد', 'محمد'])
        })

        it('filters by query (ILIKE)', async () => {
            const { company, user } = await setup()
            await createDriver(testApp.dataSource, company.id, 'محمد علي')
            await createDriver(testApp.dataSource, company.id, 'أحمد')

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/drivers?query=علي')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.body.data).toHaveLength(1)
            expect(res.body.data[0].nameAr).toBe('محمد علي')
        })

        it('hides soft-deleted drivers', async () => {
            const { company, user } = await setup()
            const d = await createDriver(testApp.dataSource, company.id, 'محذوف')
            await testApp.dataSource.getRepository(DriverEntity).update({ id: d.id }, { deletedAt: new Date() })

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/drivers')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.body.data).toHaveLength(0)
        })

        it('does not leak drivers from other companies', async () => {
            const { user } = await setup()
            const otherCompany = await createCompany(testApp.dataSource, 'أخرى')
            await createDriver(testApp.dataSource, otherCompany.id, 'تسرّب')

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/drivers')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.body.data).toHaveLength(0)
        })
    })

    describe('PATCH /api/v1/dashboard/drivers/:id', () => {
        it('renames a driver', async () => {
            const { company, user } = await setup()
            const d = await createDriver(testApp.dataSource, company.id, 'قديم')
            const res = await request(testApp.app.getHttpServer())
                .patch(`/api/v1/dashboard/drivers/${d.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ nameAr: 'جديد' })
            expect(res.status).toBe(200)
            expect(res.body.data.nameAr).toBe('جديد')
        })

        it('409 if new name collides with another active driver', async () => {
            const { company, user } = await setup()
            const a = await createDriver(testApp.dataSource, company.id, 'أحمد')
            await createDriver(testApp.dataSource, company.id, 'محمد')

            const res = await request(testApp.app.getHttpServer())
                .patch(`/api/v1/dashboard/drivers/${a.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ nameAr: 'محمد' })
            expect(res.status).toBe(409)
        })

        it('403 cross-company', async () => {
            const { user } = await setup()
            const otherCompany = await createCompany(testApp.dataSource, 'أخرى')
            const d = await createDriver(testApp.dataSource, otherCompany.id, 'تسرّب')

            const res = await request(testApp.app.getHttpServer())
                .patch(`/api/v1/dashboard/drivers/${d.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ nameAr: 'جديد' })
            expect(res.status).toBe(403)
        })
    })

    describe('DELETE /api/v1/dashboard/drivers/:id', () => {
        it('soft-deletes a driver with no upcoming refs', async () => {
            const { company, user } = await setup()
            const d = await createDriver(testApp.dataSource, company.id, 'سائق')
            const res = await request(testApp.app.getHttpServer())
                .delete(`/api/v1/dashboard/drivers/${d.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(res.status).toBe(204)

            const row = await testApp.dataSource.getRepository(DriverEntity).findOne({ where: { id: d.id } })
            expect(row?.deletedAt).not.toBeNull()
        })

        it('soft-deletes when only past trips reference the driver (driver still resolvable for history)', async () => {
            const { company, user } = await setup()
            const d = await createDriver(testApp.dataSource, company.id, 'سائق')
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            const dateStr = yesterday.toISOString().split('T')[0]!
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                driverId: d.id,
                date: dateStr,
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .delete(`/api/v1/dashboard/drivers/${d.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(res.status).toBe(204)

            const row = await testApp.dataSource.getRepository(DriverEntity).findOne({ where: { id: d.id } })
            expect(row?.deletedAt).not.toBeNull()
        })

        it('409s with conflict info when an upcoming trip references the driver', async () => {
            const { company, user } = await setup()
            const d = await createDriver(testApp.dataSource, company.id, 'سائق')
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 7)
            const dateStr = tomorrow.toISOString().split('T')[0]!
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                driverId: d.id,
                date: dateStr,
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .delete(`/api/v1/dashboard/drivers/${d.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(res.status).toBe(409)
            expect(res.body.upcomingTripCount).toBe(1)
            expect(res.body.sampleTripDates).toEqual([dateStr])
        })

        it('reassigns + soft-deletes in one tx with replacementDriverId', async () => {
            const { company, user } = await setup()
            const d1 = await createDriver(testApp.dataSource, company.id, 'سائق')
            const d2 = await createDriver(testApp.dataSource, company.id, 'بديل')
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 7)
            const dateStr = tomorrow.toISOString().split('T')[0]!
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                driverId: d1.id,
                date: dateStr,
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .delete(`/api/v1/dashboard/drivers/${d1.id}?replacementDriverId=${d2.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(res.status).toBe(204)

            const reloaded = await testApp.dataSource.getRepository(TripEntity).findOneOrFail({ where: { id: trip.id } })
            expect(reloaded.driverId).toBe(d2.id)

            const removed = await testApp.dataSource.getRepository(DriverEntity).findOne({ where: { id: d1.id } })
            expect(removed?.deletedAt).not.toBeNull()
            const replacement = await testApp.dataSource.getRepository(DriverEntity).findOne({
                where: { id: d2.id, deletedAt: IsNull() },
            })
            expect(replacement).not.toBeNull()
        })

        it('400s when replacement is the same driver', async () => {
            const { company, user } = await setup()
            const d = await createDriver(testApp.dataSource, company.id, 'سائق')
            const res = await request(testApp.app.getHttpServer())
                .delete(`/api/v1/dashboard/drivers/${d.id}?replacementDriverId=${d.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(res.status).toBe(400)
        })

        it('403 cross-company for replacement', async () => {
            const { company, user } = await setup()
            const otherCompany = await createCompany(testApp.dataSource, 'أخرى')
            const d1 = await createDriver(testApp.dataSource, company.id, 'سائق')
            const dOther = await createDriver(testApp.dataSource, otherCompany.id, 'تسرّب')

            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 7)
            const dateStr = tomorrow.toISOString().split('T')[0]!
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                driverId: d1.id,
                date: dateStr,
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .delete(`/api/v1/dashboard/drivers/${d1.id}?replacementDriverId=${dOther.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(res.status).toBe(403)
        })
    })

    describe('Driver wiring on trip create', () => {
        it('attaches an existing driver by id', async () => {
            const { company, user } = await setup()
            const d = await createDriver(testApp.dataSource, company.id, 'محمد')

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    date: '2026-05-10',
                    driver: { id: d.id },
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                })
            expect(res.status).toBe(201)

            const trip = await testApp.dataSource.getRepository(TripEntity).findOneOrFail({ where: { id: res.body.data.id } })
            expect(trip.driverId).toBe(d.id)
        })

        it('find-or-creates a driver by name', async () => {
            const { user } = await setup()
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    date: '2026-05-10',
                    driver: { name: 'سائق جديد' },
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                })
            expect(res.status).toBe(201)

            const trip = await testApp.dataSource.getRepository(TripEntity).findOneOrFail({
                where: { id: res.body.data.id },
                relations: { driver: true },
            })
            expect(trip.driver.nameAr).toBe('سائق جديد')
        })

        it('400 when driver is missing both id and name', async () => {
            const { user } = await setup()
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    date: '2026-05-10',
                    driver: {},
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                })
            expect(res.status).toBe(400)
        })

        it('rejects a driver id from another company (404 — driver not visible)', async () => {
            const { user } = await setup()
            const otherCompany = await createCompany(testApp.dataSource, 'أخرى')
            const dOther = await createDriver(testApp.dataSource, otherCompany.id, 'تسرّب')

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    date: '2026-05-10',
                    driver: { id: dOther.id },
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                })
            expect(res.status).toBe(403)
        })
    })
})
