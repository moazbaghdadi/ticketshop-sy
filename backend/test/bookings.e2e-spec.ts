import request from 'supertest'
import { BookingEntity } from '../src/features/bookings/entities/booking.entity'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import { createCompany, createTrip, createUser, damascusHomsAleppoPrices, damascusHomsAleppoStations } from './setup/seed-helpers'

describe('Bookings (e2e — covers the FOR UPDATE / segment-overlap critical path)', () => {
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

    describe('POST /api/v1/bookings (customer)', () => {
        it('creates a booking, computes price = pair × seats, returns a stable reference', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [
                        { seatId: 1, gender: 'male' },
                        { seatId: 2, gender: 'male' },
                    ],
                    paymentMethod: 'syriatel-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '0900-000-000', email: 'ali@test.com' },
                })

            expect(res.status).toBe(201)
            expect(res.body.data.reference).toMatch(/^SY-[0-9A-F]{6}$/)
            expect(res.body.data.totalPrice).toBe(50000) // 25000 × 2
            expect(res.body.data.seats).toEqual([1, 2])
            expect(res.body.data.passenger).toMatchObject({ name: 'علي', phone: '0900-000-000', email: 'ali@test.com' })

            // Persisted under .findByReference
            const get = await request(testApp.app.getHttpServer()).get(`/api/v1/bookings/${res.body.data.reference}`)
            expect(get.status).toBe(200)
            expect(get.body.data.id).toBe(res.body.data.id)
        })

        it('404s when GET /bookings/:ref is unknown', async () => {
            const res = await request(testApp.app.getHttpServer()).get('/api/v1/bookings/SY-NOPE99')
            expect(res.status).toBe(404)
        })

        it('404s when tripId is unknown', async () => {
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: '00000000-0000-0000-0000-000000000000',
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(res.status).toBe(404)
        })

        it('400s on reversed boarding/dropoff', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'aleppo',
                    dropoffStationId: 'damascus',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(res.status).toBe(400)
        })

        it('400s when boarding/dropoff is not on the trip', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'tartus',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(res.status).toBe(400)
        })

        it('422s when the trip has no segment price for the requested pair', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                // Missing damascus → aleppo on purpose.
                prices: [
                    { fromCityId: 'damascus', toCityId: 'homs', price: 10000 },
                    { fromCityId: 'homs', toCityId: 'aleppo', price: 16000 },
                ],
            })
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(res.status).toBe(422)
        })

        it('409 when a seat is already booked on an overlapping segment', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const first = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 10, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(first.status).toBe(201)

            const second = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 10, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'homs', // overlaps damascus→aleppo
                    passenger: { name: 'سامي', phone: '09000001' },
                })
            expect(second.status).toBe(409)
        })

        it('allows re-using a seat on a touching, non-overlapping segment (handoff at intermediate station)', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const a = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 12, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'homs',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(a.status).toBe(201)

            const b = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 12, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'homs',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'سامي', phone: '09000001' },
                })
            expect(b.status).toBe(201)
        })

        it('422 enforce-gender on customer endpoint when neighbor is opposite gender', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            // Seat 1 is male. Seat 2 is the side-neighbor (col 0/1 pair).
            const first = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(first.status).toBe(201)

            const second = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 2, gender: 'female' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'هدى', phone: '09000002' },
                })
            expect(second.status).toBe(422)
        })

        it('400s on malformed body (invalid seat id, missing passenger)', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 99, gender: 'male' }], // > 40
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(res.status).toBe(400)
        })
    })

    describe('POST /api/v1/dashboard/bookings (admin/sales — gender warning instead of 422)', () => {
        it('lets dashboard create a mixed-gender adjacency and returns a warning', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const sales = await createUser(testApp.app, testApp.dataSource, {
                email: 'sales@test.com',
                companyId: company.id,
                role: 'sales',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            // Seed seat 1 as male via the customer endpoint.
            const first = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(first.status).toBe(201)

            // Now have the dashboard book the adjacent seat 2 as female — should succeed with a warning.
            const dashboardRes = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/bookings')
                .set('Authorization', `Bearer ${sales.accessToken}`)
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 2, gender: 'female' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'هدى', phone: '09000002' },
                })
            expect(dashboardRes.status).toBe(201)
            expect(dashboardRes.body.warning).toBeTruthy()
            expect(dashboardRes.body.data.seats).toEqual([2])
        })

        it('403 cross-company on dashboard booking create', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const otherCompany = await createCompany(testApp.dataSource, 'شركة أخرى')
            const sales = await createUser(testApp.app, testApp.dataSource, {
                email: 'sales@test.com',
                companyId: company.id,
                role: 'sales',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: otherCompany.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/bookings')
                .set('Authorization', `Bearer ${sales.accessToken}`)
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 1, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'علي', phone: '09000000' },
                })
            expect(res.status).toBe(403)
        })
    })

    describe('Concurrent booking races (SQL-level FOR UPDATE coverage — CLAUDE.md rule #2)', () => {
        it('serializes concurrent same-seat creates so exactly one wins', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const fire = (passengerName: string): request.Test =>
                request(testApp.app.getHttpServer())
                    .post('/api/v1/bookings')
                    .send({
                        tripId: trip.id,
                        seatSelections: [{ seatId: 20, gender: 'male' }],
                        paymentMethod: 'sham-cash',
                        boardingStationId: 'damascus',
                        dropoffStationId: 'aleppo',
                        passenger: { name: passengerName, phone: '09000000' },
                    })

            const results = await Promise.allSettled([fire('A'), fire('B'), fire('C'), fire('D'), fire('E')])
            const statuses = results.map(r => (r.status === 'fulfilled' ? r.value.status : -1))
            const successes = statuses.filter(s => s === 201)
            const conflicts = statuses.filter(s => s === 409)
            expect(successes).toHaveLength(1)
            expect(conflicts.length).toBeGreaterThanOrEqual(1)
            expect(successes.length + conflicts.length).toBe(statuses.length)

            // And the DB only persists one booking on seat 20.
            const persisted = await testApp.dataSource.getRepository(BookingEntity).find({ where: { tripId: trip.id } })
            expect(persisted).toHaveLength(1)
            expect(persisted[0]!.seatIds).toEqual([20])
        })
    })
})
