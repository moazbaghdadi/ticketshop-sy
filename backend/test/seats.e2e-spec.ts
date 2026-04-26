import request from 'supertest'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import { createCompany, createTrip, damascusHomsAleppoPrices, damascusHomsAleppoStations } from './setup/seed-helpers'

describe('Seats endpoint (e2e)', () => {
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

    async function bookSeat(opts: {
        tripId: string
        seatId: number
        gender: 'male' | 'female'
        boardingStationId: string
        dropoffStationId: string
    }): Promise<void> {
        const res = await request(testApp.app.getHttpServer())
            .post('/api/v1/bookings')
            .send({
                tripId: opts.tripId,
                seatSelections: [{ seatId: opts.seatId, gender: opts.gender }],
                paymentMethod: 'sham-cash',
                boardingStationId: opts.boardingStationId,
                dropoffStationId: opts.dropoffStationId,
                passenger: { name: 'علي', phone: '09000000' },
            })
        expect(res.status).toBe(201)
    }

    describe('GET /api/v1/trips/:tripId/seats', () => {
        it('returns 40 seats laid out 10x4', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer()).get(`/api/v1/trips/${trip.id}/seats`)
            expect(res.status).toBe(200)
            expect(res.body.data).toHaveLength(40)
            expect(res.body.data[0]).toMatchObject({ id: 1, row: 0, col: 0, status: 'available' })
            expect(res.body.data[39]).toMatchObject({ id: 40, row: 9, col: 3, status: 'available' })
        })

        it('marks confirmed-booking seats as occupied (no segment filter)', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            await bookSeat({
                tripId: trip.id,
                seatId: 5,
                gender: 'male',
                boardingStationId: 'damascus',
                dropoffStationId: 'homs',
            })

            const res = await request(testApp.app.getHttpServer()).get(`/api/v1/trips/${trip.id}/seats`)
            expect(res.status).toBe(200)
            const seat5 = res.body.data.find((s: { id: number }) => s.id === 5)
            expect(seat5).toMatchObject({ status: 'occupied', gender: 'male' })
        })

        it('segment filter: a damascus→homs booking does NOT occupy seat for homs→aleppo (touching, not overlapping)', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            // Existing booking: damascus → homs on seat 5
            await bookSeat({
                tripId: trip.id,
                seatId: 5,
                gender: 'male',
                boardingStationId: 'damascus',
                dropoffStationId: 'homs',
            })

            const res = await request(testApp.app.getHttpServer()).get(
                `/api/v1/trips/${trip.id}/seats?boardingStationId=homs&dropoffStationId=aleppo`
            )
            expect(res.status).toBe(200)
            const seat5 = res.body.data.find((s: { id: number }) => s.id === 5)
            expect(seat5.status).toBe('available')
        })

        it('segment filter: a damascus→aleppo booking occupies the seat for an overlapping homs→aleppo segment', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            await bookSeat({
                tripId: trip.id,
                seatId: 7,
                gender: 'female',
                boardingStationId: 'damascus',
                dropoffStationId: 'aleppo',
            })

            const res = await request(testApp.app.getHttpServer()).get(
                `/api/v1/trips/${trip.id}/seats?boardingStationId=homs&dropoffStationId=aleppo`
            )
            expect(res.status).toBe(200)
            const seat7 = res.body.data.find((s: { id: number }) => s.id === 7)
            expect(seat7).toMatchObject({ status: 'occupied', gender: 'female' })
        })

        it('400s when only one of boarding/dropoff is supplied', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer()).get(
                `/api/v1/trips/${trip.id}/seats?boardingStationId=damascus`
            )
            expect(res.status).toBe(400)
        })

        it('400s on a station that does not belong to the trip', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer()).get(
                `/api/v1/trips/${trip.id}/seats?boardingStationId=damascus&dropoffStationId=tartus`
            )
            expect(res.status).toBe(400)
        })

        it('400s on reversed boarding/dropoff', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })
            const res = await request(testApp.app.getHttpServer()).get(
                `/api/v1/trips/${trip.id}/seats?boardingStationId=aleppo&dropoffStationId=damascus`
            )
            expect(res.status).toBe(400)
        })

        it('404s on unknown trip id', async () => {
            const res = await request(testApp.app.getHttpServer()).get(`/api/v1/trips/00000000-0000-0000-0000-000000000000/seats`)
            expect(res.status).toBe(404)
        })

        it('400s on a non-UUID :tripId', async () => {
            const res = await request(testApp.app.getHttpServer()).get(`/api/v1/trips/not-a-uuid/seats`)
            expect(res.status).toBe(400)
        })
    })
})
