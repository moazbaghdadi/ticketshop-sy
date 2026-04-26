import request from 'supertest'
import { BookingEntity } from '../src/features/bookings/entities/booking.entity'
import { CancelledTripDismissalEntity } from '../src/features/trips/entities/cancelled-trip-dismissal.entity'
import { TripEntity } from '../src/features/trips/entities/trip.entity'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import { createCompany, createTrip, createUser, damascusHomsAleppoPrices, damascusHomsAleppoStations } from './setup/seed-helpers'

describe('Dashboard trip create/cancel/dismiss (e2e)', () => {
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

    describe('POST /api/v1/dashboard/trips (create)', () => {
        it('creates a trip with stations + segment prices and returns its id', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({
                    date: '2026-05-10',
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                })

            expect(res.status).toBe(201)
            expect(res.body.data.id).toEqual(expect.any(String))

            const trip = await testApp.dataSource.getRepository(TripEntity).findOneOrFail({
                where: { id: res.body.data.id },
                relations: { stations: true, segmentPrices: true },
            })
            expect(trip.companyId).toBe(company.id)
            expect(trip.stations).toHaveLength(3)
            expect(trip.segmentPrices).toHaveLength(3)
        })

        it('400s when fewer than 2 stations are provided', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({
                    date: '2026-05-10',
                    stations: [{ cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '08:00' }],
                    segmentPrices: [{ fromCityId: 'damascus', toCityId: 'homs', price: 1000 }],
                })

            expect(res.status).toBe(400)
        })

        it('400s on duplicate cities', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({
                    date: '2026-05-10',
                    stations: [
                        { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '08:00' },
                        { cityId: 'damascus', order: 1, arrivalTime: '09:00', departureTime: null },
                    ],
                    segmentPrices: [{ fromCityId: 'damascus', toCityId: 'damascus', price: 1000 }],
                })

            expect(res.status).toBe(400)
            expect(JSON.stringify(res.body)).toContain('Duplicate city')
        })

        it('400s when first station has no departureTime', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({
                    date: '2026-05-10',
                    stations: [
                        { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: null },
                        { cityId: 'homs', order: 1, arrivalTime: '10:00', departureTime: null },
                    ],
                    segmentPrices: [{ fromCityId: 'damascus', toCityId: 'homs', price: 5000 }],
                })

            expect(res.status).toBe(400)
            expect(JSON.stringify(res.body)).toContain('First station must have a departureTime')
        })

        it('400s on non-monotonic times', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({
                    date: '2026-05-10',
                    stations: [
                        { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '12:00' },
                        { cityId: 'homs', order: 1, arrivalTime: '08:00', departureTime: null },
                    ],
                    segmentPrices: [{ fromCityId: 'damascus', toCityId: 'homs', price: 5000 }],
                })

            expect(res.status).toBe(400)
            expect(JSON.stringify(res.body)).toContain('non-monotonic times')
        })

        it('400s when a (i<j) station pair has no positive price', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({
                    date: '2026-05-10',
                    stations: damascusHomsAleppoStations(),
                    // missing damascus → aleppo
                    segmentPrices: [
                        { fromCityId: 'damascus', toCityId: 'homs', price: 10000 },
                        { fromCityId: 'homs', toCityId: 'aleppo', price: 16000 },
                    ],
                })

            expect(res.status).toBe(400)
            expect(JSON.stringify(res.body)).toContain('damascus → aleppo')
        })

        it('400s on unknown cityId', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({
                    date: '2026-05-10',
                    stations: [
                        { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '08:00' },
                        { cityId: 'atlantis', order: 1, arrivalTime: '10:00', departureTime: null },
                    ],
                    segmentPrices: [{ fromCityId: 'damascus', toCityId: 'atlantis', price: 5000 }],
                })

            expect(res.status).toBe(400)
            expect(JSON.stringify(res.body)).toContain('Unknown cityId')
        })

        it('forbids a sales user (admin-only)', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const sales = await createUser(testApp.app, testApp.dataSource, {
                email: 'sales@test.com',
                companyId: company.id,
                role: 'sales',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${sales.accessToken}`)
                .send({
                    date: '2026-05-10',
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                })

            expect(res.status).toBe(403)
        })
    })

    describe('POST /api/v1/dashboard/trips/:id/cancel', () => {
        it('cancels a trip and cascades status="cancelled" onto its bookings', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-10',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            // Stage one confirmed booking on the trip via the customer endpoint.
            const bookingRes = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 5, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(bookingRes.status).toBe(201)

            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ reason: 'حافلة معطلة' })

            expect(res.status).toBe(201)
            expect(res.body.data.cancelledReason).toBe('حافلة معطلة')

            const bookings = await testApp.dataSource.getRepository(BookingEntity).find({ where: { tripId: trip.id } })
            expect(bookings).toHaveLength(1)
            expect(bookings[0]!.status).toBe('cancelled')
        })

        it('is idempotent — re-cancelling returns the existing cancellation', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-10',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const first = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ reason: 'سبب أول' })
            expect(first.status).toBe(201)

            const second = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ reason: 'سبب آخر' })
            expect(second.status).toBe(201)
            // Reason from the FIRST cancel must persist (idempotent).
            expect(second.body.data.cancelledReason).toBe('سبب أول')
        })

        it('403s cross-company', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const otherCompany = await createCompany(testApp.dataSource, 'شركة أخرى')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: otherCompany.id,
                date: '2026-05-10',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ reason: 'حافلة معطلة' })
            expect(res.status).toBe(403)
        })

        it('400s on missing/empty reason', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-10',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ reason: '' })
            expect(res.status).toBe(400)
        })

        it('404s on unknown trip id', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips/00000000-0000-0000-0000-000000000000/cancel')
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ reason: 'حافلة معطلة' })
            expect(res.status).toBe(404)
        })
    })

    describe('POST /api/v1/dashboard/trips/:id/dismiss-cancellation', () => {
        it('records a dismissal once and is idempotent on a re-dismiss', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-10',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const r1 = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/dismiss-cancellation`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(r1.status).toBe(204)

            const r2 = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/dismiss-cancellation`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(r2.status).toBe(204)

            const dismissals = await testApp.dataSource
                .getRepository(CancelledTripDismissalEntity)
                .find({ where: { userId: admin.id, tripId: trip.id } })
            expect(dismissals).toHaveLength(1)
        })

        it('403s cross-company', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const otherCompany = await createCompany(testApp.dataSource, 'شركة أخرى')
            const admin = await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: otherCompany.id,
                date: '2026-05-10',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/dismiss-cancellation`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(403)
        })
    })
})
