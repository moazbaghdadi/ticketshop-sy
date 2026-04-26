import request from 'supertest'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import { createCompany, createTrip, createUser, damascusHomsAleppoPrices, damascusHomsAleppoStations } from './setup/seed-helpers'

describe('Trips search + dashboard list (e2e)', () => {
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

    describe('GET /api/v1/trips (customer search)', () => {
        it('returns trips that serve the requested pair on the requested date', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer()).get(
                '/api/v1/trips?fromCityId=damascus&toCityId=aleppo&date=2026-05-01'
            )

            expect(res.status).toBe(200)
            expect(res.body.data).toHaveLength(1)
            const trip = res.body.data[0]
            expect(trip.from.id).toBe('damascus')
            expect(trip.to.id).toBe('aleppo')
            expect(trip.price).toBe(25000)
            expect(trip.stops).toBe(1) // homs is between damascus and aleppo
            expect(trip.departureTime).toBe('08:00')
            expect(trip.arrivalTime).toBe('13:00')
        })

        it('returns trips for an intermediate pair (boarding=damascus, dropoff=homs)', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer()).get(
                '/api/v1/trips?fromCityId=damascus&toCityId=homs&date=2026-05-01'
            )
            expect(res.status).toBe(200)
            expect(res.body.data).toHaveLength(1)
            expect(res.body.data[0].price).toBe(10000)
            expect(res.body.data[0].stops).toBe(0)
        })

        it('orders results by departure time ascending', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: [
                    { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '14:00' },
                    { cityId: 'homs', order: 1, arrivalTime: '16:00', departureTime: null },
                ],
                prices: [{ fromCityId: 'damascus', toCityId: 'homs', price: 9000 }],
            })
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: [
                    { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                    { cityId: 'homs', order: 1, arrivalTime: '08:00', departureTime: null },
                ],
                prices: [{ fromCityId: 'damascus', toCityId: 'homs', price: 8000 }],
            })

            const res = await request(testApp.app.getHttpServer()).get(
                '/api/v1/trips?fromCityId=damascus&toCityId=homs&date=2026-05-01'
            )

            expect(res.status).toBe(200)
            expect(res.body.data.map((t: { departureTime: string }) => t.departureTime)).toEqual(['06:00', '14:00'])
        })

        it('returns empty when from === to', async () => {
            const res = await request(testApp.app.getHttpServer()).get(
                '/api/v1/trips?fromCityId=damascus&toCityId=damascus&date=2026-05-01'
            )
            expect(res.status).toBe(200)
            expect(res.body.data).toEqual([])
        })

        it('returns empty when no trip serves the pair (reversed direction)', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            // The trip goes damascus → aleppo; a search for aleppo → damascus must return [].
            const res = await request(testApp.app.getHttpServer()).get(
                '/api/v1/trips?fromCityId=aleppo&toCityId=damascus&date=2026-05-01'
            )
            expect(res.status).toBe(200)
            expect(res.body.data).toEqual([])
        })

        it('400s on unknown cityId', async () => {
            const res = await request(testApp.app.getHttpServer()).get(
                '/api/v1/trips?fromCityId=atlantis&toCityId=damascus&date=2026-05-01'
            )
            expect(res.status).toBe(400)
        })

        it('400s on invalid date format', async () => {
            const res = await request(testApp.app.getHttpServer()).get(
                '/api/v1/trips?fromCityId=damascus&toCityId=aleppo&date=not-a-date'
            )
            expect(res.status).toBe(400)
        })

        it('does not return trips on a different date', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-02',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer()).get(
                '/api/v1/trips?fromCityId=damascus&toCityId=aleppo&date=2026-05-01'
            )
            expect(res.status).toBe(200)
            expect(res.body.data).toEqual([])
        })
    })

    describe('GET /api/v1/dashboard/trips (admin/sales list)', () => {
        it('returns the company’s trips ordered by date desc, paginated', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const otherCompany = await createCompany(testApp.dataSource, 'شركة أخرى')
            const user = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-03',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            // A trip for another company should NOT show up.
            await createTrip(testApp.dataSource, {
                companyId: otherCompany.id,
                date: '2026-05-04',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.status).toBe(200)
            expect(res.body.data.total).toBe(2)
            expect(res.body.data.trips.map((t: { date: string }) => t.date)).toEqual(['2026-05-03', '2026-05-01'])
        })

        it('filters by date', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const user = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-03',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/trips?date=2026-05-03')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.status).toBe(200)
            expect(res.body.data.total).toBe(1)
            expect(res.body.data.trips[0].date).toBe('2026-05-03')
        })

        it('filters by status=cancelled', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const user = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const cancelled = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-02',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            await testApp.dataSource.query(
                `UPDATE trips SET "cancelledAt" = NOW(), "cancelledReason" = 'حافلة معطلة' WHERE id = $1`,
                [cancelled.id]
            )

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/trips?status=cancelled')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.status).toBe(200)
            expect(res.body.data.total).toBe(1)
            expect(res.body.data.trips[0].cancelledAt).not.toBeNull()
        })

        it('400s on invalid sortBy / status enum values', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const user = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/trips?sortBy=lol')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.status).toBe(400)
        })

        it('401s without a token', async () => {
            const res = await request(testApp.app.getHttpServer()).get('/api/v1/dashboard/trips')
            expect(res.status).toBe(401)
        })
    })

    describe('GET /api/v1/dashboard/trips/:id/bookings (trip detail)', () => {
        it('returns the trip + bookings for the caller’s company', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const user = await createUser(testApp.app, testApp.dataSource, {
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

            const res = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/trips/${trip.id}/bookings`)
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.status).toBe(200)
            expect(res.body.data.id).toBe(trip.id)
            expect(res.body.data.stations).toHaveLength(3)
            expect(res.body.data.bookings).toEqual([])
        })

        it('403s when the trip belongs to another company', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const otherCompany = await createCompany(testApp.dataSource, 'شركة أخرى')
            const user = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: otherCompany.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/trips/${trip.id}/bookings`)
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.status).toBe(403)
        })

        it('404s when the trip does not exist', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const user = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/trips/00000000-0000-0000-0000-000000000000/bookings')
                .set('Authorization', `Bearer ${user.accessToken}`)

            expect(res.status).toBe(404)
        })

        it('400s on a non-UUID :id', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const user = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/trips/not-a-uuid/bookings')
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(res.status).toBe(400)
        })
    })
})
