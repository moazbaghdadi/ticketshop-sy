import request from 'supertest'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import { createCompany, createTrip, createUser, damascusHomsAleppoPrices, damascusHomsAleppoStations } from './setup/seed-helpers'

describe('Dashboard reports (e2e)', () => {
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

    describe('GET /api/v1/dashboard/reports', () => {
        it('aggregates totals/perDay/perRoute over confirmed bookings in range', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const tripA = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const tripB = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-02',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            // tripA: 2 seats damascus → aleppo (25000 each = 50000) + 1 seat damascus → homs (10000)
            await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: tripA.id,
                    seatSelections: [
                        { seatId: 1, gender: 'male' },
                        { seatId: 2, gender: 'male' },
                    ],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '0900000000' },
                })
                .expect(201)
            await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: tripA.id,
                    seatSelections: [{ seatId: 8, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'homs',
                    passenger: { name: 'سامي', phone: '0900000001' },
                })
                .expect(201)
            // tripB: 1 seat damascus → aleppo (25000)
            await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: tripB.id,
                    seatSelections: [{ seatId: 5, gender: 'female' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'هدى', phone: '0900000002' },
                })
                .expect(201)

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/reports?from=2026-05-01&to=2026-05-02')
                .set('Authorization', `Bearer ${admin.accessToken}`)

            expect(res.status).toBe(200)
            expect(res.body.data.totals).toEqual({ bookings: 3, seats: 4, revenue: 85000, trips: 2 })

            expect(res.body.data.perDay).toHaveLength(2)
            expect(res.body.data.perDay[0]).toMatchObject({ date: '2026-05-01', bookings: 2, seats: 3, revenue: 60000 })
            expect(res.body.data.perDay[1]).toMatchObject({ date: '2026-05-02', bookings: 1, seats: 1, revenue: 25000 })

            // perRoute is sorted by revenue desc — damascus→aleppo (75000) first, damascus→homs (10000) second.
            expect(res.body.data.perRoute).toHaveLength(2)
            expect(res.body.data.perRoute[0]).toMatchObject({
                fromCityId: 'damascus',
                toCityId: 'aleppo',
                revenue: 75000,
                bookings: 2,
                seats: 3,
            })
            expect(res.body.data.perRoute[1]).toMatchObject({
                fromCityId: 'damascus',
                toCityId: 'homs',
                revenue: 10000,
                bookings: 1,
                seats: 1,
            })
        })

        it('does not count cancelled bookings', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const r = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '0900000000' },
                })
                .expect(201)
            await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${r.body.data.reference}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .expect(201)

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/reports?from=2026-05-01&to=2026-05-01')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(200)
            expect(res.body.data.totals).toEqual({ bookings: 0, seats: 0, revenue: 0, trips: 0 })
        })

        it('400 when from > to', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/reports?from=2026-05-10&to=2026-05-01')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(400)
        })

        it('400 when from/to is malformed', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/reports?from=not-a-date&to=2026-05-01')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(400)
        })

        it('does not include other companies’ bookings', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const otherCompany = await createCompany(testApp.dataSource, 'شركة أخرى')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const otherTrip = await createTrip(testApp.dataSource, {
                companyId: otherCompany.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: otherTrip.id,
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '0900000000' },
                })
                .expect(201)

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/reports?from=2026-05-01&to=2026-05-01')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(200)
            expect(res.body.data.totals.revenue).toBe(0)
        })
    })

    describe('POST /api/v1/dashboard/reports/email', () => {
        it('204 on success (admin)', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/reports/email')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ from: '2026-01-01', to: '2026-01-31', recipient: 'boss@test.com' })
            expect(res.status).toBe(204)
        })

        it('403 for sales role', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const sales = await createUser(testApp.app, testApp.dataSource, {
                email: 'sales@test.com',
                companyId: company.id,
                role: 'sales',
            })
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/reports/email')
                .set('Authorization', `Bearer ${sales.accessToken}`)
                .send({ from: '2026-01-01', to: '2026-01-31', recipient: 'boss@test.com' })
            expect(res.status).toBe(403)
        })

        it('400 on a malformed recipient email', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/reports/email')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ from: '2026-01-01', to: '2026-01-31', recipient: 'not-an-email' })
            expect(res.status).toBe(400)
        })
    })
})
