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

function isoDay(offsetDays: number): string {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().slice(0, 10)
}

describe('Dashboard overview (e2e)', () => {
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

    async function setupCompany(): Promise<{ company: { id: string }; admin: CreatedUser }> {
        const company = await createCompany(testApp.dataSource, 'شركة')
        const admin = await createUser(testApp.app, testApp.dataSource, {
            email: 'admin@test.com',
            companyId: company.id,
            role: 'admin',
        })
        return { company, admin }
    }

    it('401s without auth', async () => {
        const res = await request(testApp.app.getHttpServer()).get('/api/v1/dashboard/overview')
        expect(res.status).toBe(401)
    })

    it('returns the empty shape when there is no data', async () => {
        const { admin } = await setupCompany()
        const res = await request(testApp.app.getHttpServer())
            .get('/api/v1/dashboard/overview')
            .set('Authorization', `Bearer ${admin.accessToken}`)
        expect(res.status).toBe(200)
        expect(res.body.data).toMatchObject({
            upcomingTrips: [],
            latestSales: [],
            balance: 0,
            cancelledTrips: [],
        })
        expect(res.body.data.salesLast30Days).toHaveLength(30)
        expect(res.body.data.topRoutes).toEqual([])
    })

    it('upcomingTrips excludes cancelled and trips before today', async () => {
        const { company, admin } = await setupCompany()
        await createTrip(testApp.dataSource, {
            companyId: company.id,
            date: isoDay(-1),
            stations: damascusHomsAleppoStations(),
            prices: damascusHomsAleppoPrices(),
        })
        const upcoming = await createTrip(testApp.dataSource, {
            companyId: company.id,
            date: isoDay(2),
            stations: damascusHomsAleppoStations(),
            prices: damascusHomsAleppoPrices(),
        })
        const cancelled = await createTrip(testApp.dataSource, {
            companyId: company.id,
            date: isoDay(3),
            stations: damascusHomsAleppoStations(),
            prices: damascusHomsAleppoPrices(),
        })
        await testApp.dataSource.query(
            `UPDATE trips SET "cancelledAt" = NOW(), "cancelledReason" = 'حافلة معطلة' WHERE id = $1`,
            [cancelled.id]
        )

        const res = await request(testApp.app.getHttpServer())
            .get('/api/v1/dashboard/overview')
            .set('Authorization', `Bearer ${admin.accessToken}`)
        expect(res.status).toBe(200)
        expect(res.body.data.upcomingTrips).toHaveLength(1)
        expect(res.body.data.upcomingTrips[0].id).toBe(upcoming.id)
    })

    it('latestSales contains only confirmed bookings; balance sums their totalPrice', async () => {
        const { company, admin } = await setupCompany()
        const trip = await createTrip(testApp.dataSource, {
            companyId: company.id,
            date: isoDay(1),
            stations: damascusHomsAleppoStations(),
            prices: damascusHomsAleppoPrices(),
        })

        // Two confirmed (25000 each) + one cancelled
        const refs: string[] = []
        for (const seatId of [1, 4]) {
            const r = await request(testApp.app.getHttpServer())
                .post('/api/v1/bookings')
                .send({
                    tripId: trip.id,
                    seatSelections: [{ seatId, gender: 'male' }],
                    paymentMethod: 'sham-cash',
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                    passenger: { name: `راكب-${seatId}`, phone: '0900000000' },
                })
            expect(r.status).toBe(201)
            refs.push(r.body.data.reference as string)
        }
        const cancelled = await request(testApp.app.getHttpServer())
            .post('/api/v1/bookings')
            .send({
                tripId: trip.id,
                seatSelections: [{ seatId: 8, gender: 'male' }],
                paymentMethod: 'sham-cash',
                boardingStationId: 'damascus',
                dropoffStationId: 'aleppo',
                passenger: { name: 'ملغى', phone: '0900000000' },
            })
        expect(cancelled.status).toBe(201)
        await request(testApp.app.getHttpServer())
            .post(`/api/v1/dashboard/bookings/${cancelled.body.data.reference}/cancel`)
            .set('Authorization', `Bearer ${admin.accessToken}`)
            .expect(201)

        const res = await request(testApp.app.getHttpServer())
            .get('/api/v1/dashboard/overview')
            .set('Authorization', `Bearer ${admin.accessToken}`)

        expect(res.status).toBe(200)
        expect(res.body.data.balance).toBe(50000)
        expect(res.body.data.latestSales).toHaveLength(2)
        expect(res.body.data.latestSales.map((s: { reference: string }) => s.reference).sort()).toEqual([...refs].sort())
    })

    it('cancelledTrips honors the per-user dismissal record', async () => {
        const { company, admin } = await setupCompany()
        const trip = await createTrip(testApp.dataSource, {
            companyId: company.id,
            date: isoDay(2),
            stations: damascusHomsAleppoStations(),
            prices: damascusHomsAleppoPrices(),
        })
        await request(testApp.app.getHttpServer())
            .post(`/api/v1/dashboard/trips/${trip.id}/cancel`)
            .set('Authorization', `Bearer ${admin.accessToken}`)
            .send({ reason: 'حافلة معطلة' })
            .expect(201)

        const before = await request(testApp.app.getHttpServer())
            .get('/api/v1/dashboard/overview')
            .set('Authorization', `Bearer ${admin.accessToken}`)
        expect(before.body.data.cancelledTrips).toHaveLength(1)

        await request(testApp.app.getHttpServer())
            .post(`/api/v1/dashboard/trips/${trip.id}/dismiss-cancellation`)
            .set('Authorization', `Bearer ${admin.accessToken}`)
            .expect(204)

        const after = await request(testApp.app.getHttpServer())
            .get('/api/v1/dashboard/overview')
            .set('Authorization', `Bearer ${admin.accessToken}`)
        expect(after.body.data.cancelledTrips).toHaveLength(0)
    })
})
