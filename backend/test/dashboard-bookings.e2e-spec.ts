import request from 'supertest'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import {
    createCompany,
    CreatedUser,
    createTrip,
    createUser,
    damascusHomsAleppoPrices,
    damascusHomsAleppoStations,
} from './setup/seed-helpers'

interface BookingFixture {
    company: { id: string }
    admin: CreatedUser
    sales: CreatedUser
    trip: { id: string }
    bookingRef: string
}

describe('Dashboard bookings: search/get/update/cancel/reactivate/email/csv (e2e)', () => {
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

    async function setupOneBooking(): Promise<BookingFixture> {
        const company = await createCompany(testApp.dataSource, 'شركة')
        const admin = await createUser(testApp.app, testApp.dataSource, {
            email: 'admin@test.com',
            companyId: company.id,
            role: 'admin',
        })
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
        const create = await request(testApp.app.getHttpServer())
            .post('/api/v1/bookings')
            .send({
                tripId: trip.id,
                seatSelections: [{ seatId: 5, gender: 'male' }],
                paymentMethod: 'sham-cash',
                boardingStationId: 'damascus',
                dropoffStationId: 'aleppo',
                passenger: { name: 'علي القاسم', phone: '0900000000', email: 'ali@test.com' },
            })
        expect(create.status).toBe(201)
        return { company, admin, sales, trip, bookingRef: create.body.data.reference }
    }

    describe('GET /api/v1/dashboard/bookings (search)', () => {
        it('returns the company’s bookings with pagination metadata', async () => {
            const { admin } = await setupOneBooking()
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(200)
            expect(res.body.data.bookings).toHaveLength(1)
            expect(res.body.data.total).toBe(1)
            expect(res.body.data.page).toBe(1)
            expect(res.body.data.pageSize).toBe(20)
        })

        it('matches the query against reference / passengerName / phone (ILIKE)', async () => {
            const { admin } = await setupOneBooking()
            const r1 = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings?query=القاسم')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(r1.body.data.bookings).toHaveLength(1)

            const r2 = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings?query=09000')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(r2.body.data.bookings).toHaveLength(1)

            const r3 = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings?query=ZZZ-NOT-A-MATCH')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(r3.body.data.bookings).toHaveLength(0)
        })

        it('filters by status=cancelled', async () => {
            const { admin, bookingRef } = await setupOneBooking()
            await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .expect(201)

            const cancelled = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings?status=cancelled')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(cancelled.body.data.bookings).toHaveLength(1)

            const ongoing = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings?status=ongoing')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(ongoing.body.data.bookings).toHaveLength(0)
        })

        it('400s on an unknown status enum', async () => {
            const { admin } = await setupOneBooking()
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings?status=lol')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(400)
        })

        it('does not surface bookings from other companies', async () => {
            const { admin } = await setupOneBooking()
            const otherCompany = await createCompany(testApp.dataSource, 'شركة أخرى')
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
                    passenger: { name: 'someone-else', phone: '09100000000' },
                })
                .expect(201)

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.body.data.total).toBe(1)
            expect(res.body.data.bookings[0].passengerName).toBe('علي القاسم')
        })
    })

    describe('GET /api/v1/dashboard/bookings/:reference', () => {
        it('returns a single booking', async () => {
            const { admin, bookingRef } = await setupOneBooking()
            const res = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/bookings/${bookingRef}`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(200)
            expect(res.body.data.reference).toBe(bookingRef)
        })

        it('403 when the booking belongs to another company', async () => {
            const { bookingRef } = await setupOneBooking()
            const otherCompany = await createCompany(testApp.dataSource, 'شركة ج')
            const intruder = await createUser(testApp.app, testApp.dataSource, {
                email: 'intruder@test.com',
                companyId: otherCompany.id,
                role: 'admin',
            })
            const res = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/bookings/${bookingRef}`)
                .set('Authorization', `Bearer ${intruder.accessToken}`)
            expect(res.status).toBe(403)
        })

        it('404 on unknown reference', async () => {
            const { admin } = await setupOneBooking()
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings/SY-NOPE99')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(404)
        })
    })

    describe('PATCH /api/v1/dashboard/bookings/:reference', () => {
        it('updates passenger info', async () => {
            const { admin, bookingRef } = await setupOneBooking()
            const res = await request(testApp.app.getHttpServer())
                .patch(`/api/v1/dashboard/bookings/${bookingRef}`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ passenger: { name: 'علي الجديد', phone: '0901111111' } })
            expect(res.status).toBe(200)
            expect(res.body.data.passenger).toMatchObject({ name: 'علي الجديد', phone: '0901111111' })
        })

        it('400 if booking is cancelled', async () => {
            const { admin, bookingRef } = await setupOneBooking()
            await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .expect(201)

            const res = await request(testApp.app.getHttpServer())
                .patch(`/api/v1/dashboard/bookings/${bookingRef}`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .send({ passenger: { name: 'علي' } })
            expect(res.status).toBe(400)
        })
    })

    describe('POST /api/v1/dashboard/bookings/:reference/cancel + /reactivate', () => {
        it('cancel happy path then 400 on re-cancel', async () => {
            const { admin, bookingRef } = await setupOneBooking()
            const r1 = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(r1.status).toBe(201)
            expect(r1.body.data.status).toBe('cancelled')

            const r2 = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(r2.status).toBe(400)
        })

        it('400 cancel when the trip itself is cancelled', async () => {
            const { admin, bookingRef, trip } = await setupOneBooking()
            await testApp.dataSource.query(
                `UPDATE trips SET "cancelledAt" = NOW(), "cancelledReason" = 'حافلة معطلة' WHERE id = $1`,
                [trip.id]
            )
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(400)
        })

        it('reactivate happy path', async () => {
            const { admin, bookingRef } = await setupOneBooking()
            await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .expect(201)
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/reactivate`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(201)
            expect(res.body.data.status).toBe('confirmed')
        })

        it('reactivate 400 when not cancelled', async () => {
            const { admin, bookingRef } = await setupOneBooking()
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/reactivate`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(400)
        })

        it('reactivate 409 when seats taken in the interim (FOR UPDATE re-check path)', async () => {
            const { admin, bookingRef, trip } = await setupOneBooking()
            await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .expect(201)

            // Another customer takes seat 5 on an overlapping segment.
            await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 5, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'سامي', phone: '09111111111' },
                })
                .expect(201)

            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/reactivate`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(409)
            expect(JSON.stringify(res.body)).toContain('5')
        })

        it('reactivate 400 when the trip is cancelled', async () => {
            const { admin, bookingRef, trip } = await setupOneBooking()
            await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/cancel`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
                .expect(201)
            await testApp.dataSource.query(
                `UPDATE trips SET "cancelledAt" = NOW(), "cancelledReason" = 'حافلة معطلة' WHERE id = $1`,
                [trip.id]
            )
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/reactivate`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(400)
        })
    })

    describe('POST /api/v1/dashboard/bookings/:reference/email', () => {
        it('204 on success', async () => {
            const { admin, bookingRef } = await setupOneBooking()
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/email`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(204)
        })

        it('400 when the booking has no passenger email', async () => {
            const { admin, trip } = await setupOneBooking()
            // Create a booking without an email and try to send.
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 6, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'بدون بريد', phone: '0900000000' },
                })
            expect(res.status).toBe(201)
            const ref = res.body.data.reference
            const email = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${ref}/email`)
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(email.status).toBe(400)
        })

        it('403 cross-company', async () => {
            const { bookingRef } = await setupOneBooking()
            const otherCompany = await createCompany(testApp.dataSource, 'شركة ج')
            const intruder = await createUser(testApp.app, testApp.dataSource, {
                email: 'intruder@test.com',
                companyId: otherCompany.id,
                role: 'admin',
            })
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/bookings/${bookingRef}/email`)
                .set('Authorization', `Bearer ${intruder.accessToken}`)
            expect(res.status).toBe(403)
        })
    })

    describe('GET /api/v1/dashboard/bookings/export (CSV)', () => {
        it('returns a UTF-8 BOM-prefixed CSV with Arabic headers and translated status', async () => {
            const { admin } = await setupOneBooking()
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings/export')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            expect(res.status).toBe(200)
            expect(res.headers['content-type']).toMatch(/text\/csv/)
            expect(res.headers['content-disposition']).toMatch(/attachment/)
            const body = res.body instanceof Buffer ? res.body.toString('utf-8') : res.text
            expect(body.startsWith('﻿')).toBe(true)
            expect(body).toContain('رقم الحجز')
            expect(body).toContain('مؤكَّد')
        })

        it('quotes commas in passenger names per RFC 4180', async () => {
            const { admin, trip } = await setupOneBooking()
            const r = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId: 6, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: 'مع, فاصلة', phone: '0900000001' },
                })
            expect(r.status).toBe(201)

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/bookings/export')
                .set('Authorization', `Bearer ${admin.accessToken}`)
            const body = res.body instanceof Buffer ? res.body.toString('utf-8') : res.text
            expect(body).toMatch(/"مع, فاصلة"/)
        })
    })
})
