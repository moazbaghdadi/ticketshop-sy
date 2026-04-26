import request from 'supertest'
import { TripTemplateEntity } from '../src/features/trip-templates/entities/trip-template.entity'
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

describe('Dashboard trip templates (e2e)', () => {
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

    function templatePayload(driverIdOrName: { id?: string; name?: string }) {
        return {
            nameAr: 'صباحي',
            driver: driverIdOrName,
            stations: [
                { cityId: 'damascus', order: 0, arrivalOffsetMin: 0, departureOffsetMin: 0 },
                { cityId: 'homs', order: 1, arrivalOffsetMin: 90, departureOffsetMin: 100 },
                { cityId: 'aleppo', order: 2, arrivalOffsetMin: 210, departureOffsetMin: 210 },
            ],
            segmentPrices: [
                { fromCityId: 'damascus', toCityId: 'homs', price: 10000 },
                { fromCityId: 'damascus', toCityId: 'aleppo', price: 25000 },
                { fromCityId: 'homs', toCityId: 'aleppo', price: 16000 },
            ],
        }
    }

    describe('CRUD', () => {
        it('creates, lists, gets, updates, and deletes a template', async () => {
            const { company, user } = await setup()
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')

            const create = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send(templatePayload({ id: driver.id }))
            expect(create.status).toBe(201)
            const id = create.body.data.id as string
            expect(create.body.data.driver.id).toBe(driver.id)

            const list = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(list.body.data).toHaveLength(1)

            const get = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/trip-templates/${id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(get.body.data.stations).toHaveLength(3)
            expect(get.body.data.segmentPrices).toHaveLength(3)

            const patch = await request(testApp.app.getHttpServer())
                .patch(`/api/v1/dashboard/trip-templates/${id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ ...templatePayload({ id: driver.id }), nameAr: 'مسائي' })
            expect(patch.status).toBe(200)
            expect(patch.body.data.nameAr).toBe('مسائي')

            const del = await request(testApp.app.getHttpServer())
                .delete(`/api/v1/dashboard/trip-templates/${id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(del.status).toBe(204)

            const after = await testApp.dataSource.getRepository(TripTemplateEntity).count()
            expect(after).toBe(0)
        })

        it('find-or-creates the driver when only a name is supplied', async () => {
            const { user } = await setup()
            const create = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send(templatePayload({ name: 'سائق جديد' }))
            expect(create.status).toBe(201)
            expect(create.body.data.driver.nameAr).toBe('سائق جديد')
        })

        it('forbids sales role', async () => {
            const { company, user } = await setup('sales')
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send(templatePayload({ id: driver.id }))
            expect(res.status).toBe(403)
        })

        it('400s on duplicate cities', async () => {
            const { user } = await setup()
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    ...templatePayload({ name: 'سائق' }),
                    stations: [
                        { cityId: 'damascus', order: 0, arrivalOffsetMin: 0, departureOffsetMin: 0 },
                        { cityId: 'damascus', order: 1, arrivalOffsetMin: 60, departureOffsetMin: 60 },
                    ],
                    segmentPrices: [{ fromCityId: 'damascus', toCityId: 'damascus', price: 1000 }],
                })
            expect(res.status).toBe(400)
        })

        it('400s when first station offsets are not zero', async () => {
            const { user } = await setup()
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    ...templatePayload({ name: 'سائق' }),
                    stations: [
                        { cityId: 'damascus', order: 0, arrivalOffsetMin: 5, departureOffsetMin: 5 },
                        { cityId: 'aleppo', order: 1, arrivalOffsetMin: 200, departureOffsetMin: 200 },
                    ],
                    segmentPrices: [{ fromCityId: 'damascus', toCityId: 'aleppo', price: 25000 }],
                })
            expect(res.status).toBe(400)
            expect(JSON.stringify(res.body)).toContain('First station')
        })

        it('400s when offsets are non-monotonic', async () => {
            const { user } = await setup()
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    ...templatePayload({ name: 'سائق' }),
                    stations: [
                        { cityId: 'damascus', order: 0, arrivalOffsetMin: 0, departureOffsetMin: 0 },
                        { cityId: 'homs', order: 1, arrivalOffsetMin: 100, departureOffsetMin: 90 },
                        { cityId: 'aleppo', order: 2, arrivalOffsetMin: 200, departureOffsetMin: 200 },
                    ],
                })
            expect(res.status).toBe(400)
        })

        it('403 cross-company on get/patch/delete', async () => {
            const { user } = await setup()
            const otherCompany = await createCompany(testApp.dataSource, 'أخرى')
            const otherDriver = await createDriver(testApp.dataSource, otherCompany.id, 'سائق آخر')
            // stage a template under another company directly
            const repo = testApp.dataSource.getRepository(TripTemplateEntity)
            const tpl = await repo.save(
                repo.create({
                    companyId: otherCompany.id,
                    nameAr: 'مسرّب',
                    driverId: otherDriver.id,
                    stations: [],
                    segmentPrices: [],
                })
            )

            const get = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/trip-templates/${tpl.id}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(get.status).toBe(403)
        })
    })

    describe('POST /api/v1/dashboard/trip-templates/:id/instantiate', () => {
        it('clones a template into a fresh trip with shifted times', async () => {
            const { company, user } = await setup()
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')

            const create = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send(templatePayload({ id: driver.id }))
            const tplId = create.body.data.id as string

            const inst = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trip-templates/${tplId}/instantiate`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ date: '2030-06-01', firstDepartureTime: '14:00' })
            expect(inst.status).toBe(201)
            const tripId = inst.body.data.id as string

            const detail = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/trips/${tripId}/bookings`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(detail.status).toBe(200)
            const stations = detail.body.data.stations as { cityId: string; arrivalTime: string | null; departureTime: string | null }[]
            // damascus: dep=14:00, arr=null; homs: arr=15:30 (90min), dep=15:40 (100min);
            // aleppo: arr=17:30 (210min), dep=null
            expect(stations[0]).toMatchObject({ cityId: 'damascus', arrivalTime: null, departureTime: '14:00' })
            expect(stations[1]).toMatchObject({ cityId: 'homs', arrivalTime: '15:30', departureTime: '15:40' })
            expect(stations[2]).toMatchObject({ cityId: 'aleppo', arrivalTime: '17:30', departureTime: null })

            // Driver carries through.
            expect(detail.body.data.driver.id).toBe(driver.id)
        })

        it('400 on bad firstDepartureTime', async () => {
            const { company, user } = await setup()
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')
            const create = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send(templatePayload({ id: driver.id }))
            const tplId = create.body.data.id as string

            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trip-templates/${tplId}/instantiate`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ date: '2030-06-01', firstDepartureTime: 'noon' })
            expect(res.status).toBe(400)
        })
    })

    describe('POST /dashboard/trips/:id/save-as-template', () => {
        it('snapshots an existing trip into a new template', async () => {
            const { company, user } = await setup()
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                driverId: driver.id,
                date: '2030-06-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/save-as-template`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ name: 'صباحي' })
            expect(res.status).toBe(201)
            const tplId = res.body.data.id as string

            const detail = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/trip-templates/${tplId}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(detail.body.data.driver.id).toBe(driver.id)
            // damascusHomsAleppoStations: dep=08:00, homs arr=10:00 dep=10:15, aleppo arr=13:00.
            // Offsets: damascus 0/0, homs 120/135, aleppo 300/300.
            const stations = detail.body.data.stations as { cityId: string; arrivalOffsetMin: number; departureOffsetMin: number }[]
            expect(stations[0]).toMatchObject({ cityId: 'damascus', arrivalOffsetMin: 0, departureOffsetMin: 0 })
            expect(stations[1]).toMatchObject({ cityId: 'homs', arrivalOffsetMin: 120, departureOffsetMin: 135 })
            expect(stations[2]).toMatchObject({ cityId: 'aleppo', arrivalOffsetMin: 300, departureOffsetMin: 300 })
        })

        it('forbids sales role', async () => {
            const { company, user } = await setup('sales')
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                driverId: driver.id,
                date: '2030-06-01',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/save-as-template`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({ name: 'صباحي' })
            expect(res.status).toBe(403)
        })
    })

    describe('saveAsTemplate flag on trip-create', () => {
        it('writes both the trip AND the template in one call', async () => {
            const { company, user } = await setup()
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    date: '2030-06-01',
                    driver: { id: driver.id },
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                    saveAsTemplate: true,
                    templateName: 'صباحي',
                })
            expect(res.status).toBe(201)

            const trips = await testApp.dataSource.getRepository(TripEntity).count()
            const templates = await testApp.dataSource.getRepository(TripTemplateEntity).count()
            expect(trips).toBe(1)
            expect(templates).toBe(1)
        })

        it('400s when saveAsTemplate=true without a templateName', async () => {
            const { company, user } = await setup()
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    date: '2030-06-01',
                    driver: { id: driver.id },
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                    saveAsTemplate: true,
                })
            expect(res.status).toBe(400)
            expect(JSON.stringify(res.body)).toContain('templateName')
        })

        it('decoupling: editing the template after creation does NOT affect the trip', async () => {
            const { company, user } = await setup()
            const driver = await createDriver(testApp.dataSource, company.id, 'سائق')

            const create = await request(testApp.app.getHttpServer())
                .post('/api/v1/dashboard/trips')
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    date: '2030-06-01',
                    driver: { id: driver.id },
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                    saveAsTemplate: true,
                    templateName: 'صباحي',
                })
            expect(create.status).toBe(201)
            const tripId = create.body.data.id as string

            const tplList = await request(testApp.app.getHttpServer())
                .get('/api/v1/dashboard/trip-templates')
                .set('Authorization', `Bearer ${user.accessToken}`)
            const tplId = tplList.body.data[0].id as string

            // Edit the template (rename + change a price).
            await request(testApp.app.getHttpServer())
                .patch(`/api/v1/dashboard/trip-templates/${tplId}`)
                .set('Authorization', `Bearer ${user.accessToken}`)
                .send({
                    nameAr: 'تم التعديل',
                    driver: { id: driver.id },
                    stations: [
                        { cityId: 'damascus', order: 0, arrivalOffsetMin: 0, departureOffsetMin: 0 },
                        { cityId: 'aleppo', order: 1, arrivalOffsetMin: 200, departureOffsetMin: 200 },
                    ],
                    segmentPrices: [{ fromCityId: 'damascus', toCityId: 'aleppo', price: 99999 }],
                })

            // Trip remains its original shape (3 stations, original prices).
            const tripDetail = await request(testApp.app.getHttpServer())
                .get(`/api/v1/dashboard/trips/${tripId}/bookings`)
                .set('Authorization', `Bearer ${user.accessToken}`)
            expect(tripDetail.body.data.stations).toHaveLength(3)
        })
    })
})
