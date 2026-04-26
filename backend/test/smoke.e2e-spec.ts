import request from 'supertest'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import { createCompany } from './setup/seed-helpers'

describe('smoke', () => {
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

    it('boots the app and responds to GET /api/v1', async () => {
        const res = await request(testApp.app.getHttpServer()).get('/api/v1')
        expect([200, 404]).toContain(res.status)
    })

    it('persists a company via the seeded DataSource', async () => {
        const company = await createCompany(testApp.dataSource, 'شركة الاختبار')
        expect(company.id).toBeDefined()
    })
})
