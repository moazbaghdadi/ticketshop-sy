import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import request from 'supertest'
import { InvitationEntity } from '../src/features/auth/entities/invitation.entity'
import { UserEntity } from '../src/features/auth/entities/user.entity'
import { createTestApp, TestApp, truncateAll } from './setup/app-factory'
import { createCompany, createTrip, createUser, damascusHomsAleppoPrices, damascusHomsAleppoStations } from './setup/seed-helpers'

describe('Auth (e2e)', () => {
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

    describe('POST /api/v1/auth/login', () => {
        it('issues a session with valid credentials', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة الاختبار')
            await createUser(testApp.app, testApp.dataSource, {
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
                password: 'secretpw1',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/auth/login')
                .send({ email: 'admin@test.com', password: 'secretpw1' })

            expect(res.status).toBe(201)
            expect(res.body.data.accessToken).toEqual(expect.any(String))
            expect(res.body.data.user).toMatchObject({
                email: 'admin@test.com',
                companyId: company.id,
                role: 'admin',
            })
        })

        it('treats email as case-insensitive on login', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة الاختبار')
            await createUser(testApp.app, testApp.dataSource, {
                email: 'mixed@test.com',
                companyId: company.id,
                role: 'sales',
                password: 'secretpw1',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/auth/login')
                .send({ email: 'MIXED@test.com', password: 'secretpw1' })

            expect(res.status).toBe(201)
            expect(res.body.data.user.email).toBe('mixed@test.com')
        })

        it('401s on wrong password', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            await createUser(testApp.app, testApp.dataSource, {
                email: 'a@test.com',
                companyId: company.id,
                role: 'admin',
                password: 'rightpw1',
            })

            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/auth/login')
                .send({ email: 'a@test.com', password: 'wrongpw1' })

            expect(res.status).toBe(401)
        })

        it('401s on unknown email', async () => {
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/auth/login')
                .send({ email: 'ghost@test.com', password: 'whatever1' })

            expect(res.status).toBe(401)
        })

        it('400s on malformed body', async () => {
            const res = await request(testApp.app.getHttpServer())
                .post('/api/v1/auth/login')
                .send({ email: 'not-an-email', password: '' })

            expect(res.status).toBe(400)
        })
    })

    describe('GET /api/v1/auth/invitations/:token', () => {
        it('returns invitation summary for a valid token', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة الدعوات')
            const invRepo = testApp.dataSource.getRepository(InvitationEntity)
            const inv = await invRepo.save(
                invRepo.create({
                    token: 'valid-token-123',
                    email: 'invitee@test.com',
                    companyId: company.id,
                    role: 'sales',
                    expiresAt: new Date(Date.now() + 60_000),
                    acceptedAt: null,
                })
            )
            const res = await request(testApp.app.getHttpServer()).get(`/api/v1/auth/invitations/${inv.token}`)
            expect(res.status).toBe(200)
            expect(res.body.data).toEqual({ email: 'invitee@test.com', companyName: 'شركة الدعوات' })
        })

        it('404s on unknown token', async () => {
            const res = await request(testApp.app.getHttpServer()).get('/api/v1/auth/invitations/no-such-token')
            expect(res.status).toBe(404)
        })

        it('410s when invitation is expired', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const invRepo = testApp.dataSource.getRepository(InvitationEntity)
            const inv = await invRepo.save(
                invRepo.create({
                    token: 'expired-token',
                    email: 'late@test.com',
                    companyId: company.id,
                    role: 'sales',
                    expiresAt: new Date(Date.now() - 60_000),
                    acceptedAt: null,
                })
            )
            const res = await request(testApp.app.getHttpServer()).get(`/api/v1/auth/invitations/${inv.token}`)
            expect(res.status).toBe(410)
        })

        it('410s when invitation is already accepted', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const invRepo = testApp.dataSource.getRepository(InvitationEntity)
            const inv = await invRepo.save(
                invRepo.create({
                    token: 'accepted-token',
                    email: 'used@test.com',
                    companyId: company.id,
                    role: 'sales',
                    expiresAt: new Date(Date.now() + 60_000),
                    acceptedAt: new Date(),
                })
            )
            const res = await request(testApp.app.getHttpServer()).get(`/api/v1/auth/invitations/${inv.token}`)
            expect(res.status).toBe(410)
        })
    })

    describe('POST /api/v1/auth/invitations/:token/accept', () => {
        it('creates the user, marks invitation accepted, and returns a session', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const invRepo = testApp.dataSource.getRepository(InvitationEntity)
            const inv = await invRepo.save(
                invRepo.create({
                    token: 'good-token',
                    email: 'newhire@test.com',
                    companyId: company.id,
                    role: 'admin',
                    expiresAt: new Date(Date.now() + 60_000),
                    acceptedAt: null,
                })
            )

            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/auth/invitations/${inv.token}/accept`)
                .send({ password: 'mypassword1' })

            expect(res.status).toBe(201)
            expect(res.body.data.user).toMatchObject({ email: 'newhire@test.com', role: 'admin' })

            const user = await testApp.dataSource.getRepository(UserEntity).findOneByOrFail({ email: 'newhire@test.com' })
            expect(user.passwordHash).toBeTruthy()
            expect(await bcrypt.compare('mypassword1', user.passwordHash!)).toBe(true)

            const reloaded = await invRepo.findOneByOrFail({ id: inv.id })
            expect(reloaded.acceptedAt).not.toBeNull()
        })

        it('400s if password is too short', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const invRepo = testApp.dataSource.getRepository(InvitationEntity)
            const inv = await invRepo.save(
                invRepo.create({
                    token: 'short-pw',
                    email: 'x@test.com',
                    companyId: company.id,
                    role: 'sales',
                    expiresAt: new Date(Date.now() + 60_000),
                    acceptedAt: null,
                })
            )
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/auth/invitations/${inv.token}/accept`)
                .send({ password: 'short' })

            expect(res.status).toBe(400)
        })

        it('409s if a user with the same email already exists', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            await createUser(testApp.app, testApp.dataSource, {
                email: 'taken@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const invRepo = testApp.dataSource.getRepository(InvitationEntity)
            const inv = await invRepo.save(
                invRepo.create({
                    token: 'dup-token',
                    email: 'taken@test.com',
                    companyId: company.id,
                    role: 'sales',
                    expiresAt: new Date(Date.now() + 60_000),
                    acceptedAt: null,
                })
            )
            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/auth/invitations/${inv.token}/accept`)
                .send({ password: 'mypassword1' })
            expect(res.status).toBe(409)
        })
    })

    describe('GET /api/v1/auth/me', () => {
        it('returns the current user when authenticated', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const u = await createUser(testApp.app, testApp.dataSource, {
                email: 'me@test.com',
                companyId: company.id,
                role: 'sales',
            })

            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${u.accessToken}`)

            expect(res.status).toBe(200)
            expect(res.body.data).toMatchObject({ email: 'me@test.com', companyId: company.id, role: 'sales' })
        })

        it('401s without an Authorization header', async () => {
            const res = await request(testApp.app.getHttpServer()).get('/api/v1/auth/me')
            expect(res.status).toBe(401)
        })

        it('401s on a malformed token', async () => {
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/auth/me')
                .set('Authorization', 'Bearer not.a.real.jwt')
            expect(res.status).toBe(401)
        })
    })

    describe('Role-based access (RolesGuard)', () => {
        it('forbids a sales user from creating a trip (admin-only)', async () => {
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
                    date: '2026-05-01',
                    stations: damascusHomsAleppoStations(),
                    segmentPrices: damascusHomsAleppoPrices(),
                })

            expect(res.status).toBe(403)
        })

        it('forbids a sales user from cancelling a trip', async () => {
            const company = await createCompany(testApp.dataSource, 'شركة')
            const sales = await createUser(testApp.app, testApp.dataSource, {
                email: 'sales@test.com',
                companyId: company.id,
                role: 'sales',
            })
            const trip = await createTrip(testApp.dataSource, {
                companyId: company.id,
                date: '2026-05-02',
                stations: damascusHomsAleppoStations(),
                prices: damascusHomsAleppoPrices(),
            })

            const res = await request(testApp.app.getHttpServer())
                .post(`/api/v1/dashboard/trips/${trip.id}/cancel`)
                .set('Authorization', `Bearer ${sales.accessToken}`)
                .send({ reason: 'حافلة معطلة' })

            expect(res.status).toBe(403)
        })

        it('forbids a sales user from emailing a report', async () => {
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

        it('rejects a JWT with an unknown role (legacy "agent")', async () => {
            // Sign a token with a role that JwtStrategy.validate() should reject.
            const company = await createCompany(testApp.dataSource, 'شركة')
            const u = await createUser(testApp.app, testApp.dataSource, {
                email: 'legacy@test.com',
                companyId: company.id,
                role: 'admin',
            })
            const jwt = testApp.app.get(JwtService)
            const badToken = jwt.sign({ sub: u.id, email: u.email, companyId: u.companyId, role: 'agent' })
            const res = await request(testApp.app.getHttpServer())
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${badToken}`)
            expect(res.status).toBe(401)
        })
    })
})
