import { ConflictException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import { Repository } from 'typeorm'
import { CompanyEntity } from '../companies/entities/company.entity'
import { AuthService } from './auth.service'
import { InvitationEntity } from './entities/invitation.entity'
import { UserEntity } from './entities/user.entity'

describe('AuthService', () => {
    let service: AuthService
    let userRepository: jest.Mocked<Repository<UserEntity>>
    let invitationRepository: jest.Mocked<Repository<InvitationEntity>>
    let companyRepository: jest.Mocked<Repository<CompanyEntity>>
    let jwtService: { sign: jest.Mock }

    const mockCompany: CompanyEntity = {
        id: 'company-uuid',
        nameAr: 'الأهلية',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    }

    const buildInvitation = (overrides: Partial<InvitationEntity> = {}): InvitationEntity => ({
        id: 'inv-uuid',
        token: 'abc',
        email: 'agent@ahliya.sy',
        companyId: mockCompany.id,
        company: mockCompany,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        acceptedAt: null,
        createdAt: new Date(),
        ...overrides,
    })

    beforeEach(async () => {
        jwtService = { sign: jest.fn().mockReturnValue('jwt-token') }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: getRepositoryToken(UserEntity),
                    useValue: {
                        findOne: jest.fn(),
                        findOneBy: jest.fn(),
                        create: jest.fn((entity: Partial<UserEntity>) => entity),
                        save: jest.fn((entity: Partial<UserEntity>) => ({
                            id: 'user-uuid',
                            createdAt: new Date(),
                            ...entity,
                        })),
                    },
                },
                {
                    provide: getRepositoryToken(InvitationEntity),
                    useValue: {
                        findOne: jest.fn(),
                        findOneBy: jest.fn(),
                        create: jest.fn((entity: Partial<InvitationEntity>) => entity),
                        save: jest.fn((entity: Partial<InvitationEntity>) => ({
                            id: 'inv-uuid',
                            createdAt: new Date(),
                            ...entity,
                        })),
                    },
                },
                {
                    provide: getRepositoryToken(CompanyEntity),
                    useValue: { findOneBy: jest.fn() },
                },
                { provide: JwtService, useValue: jwtService },
            ],
        }).compile()

        service = module.get<AuthService>(AuthService)
        userRepository = module.get(getRepositoryToken(UserEntity))
        invitationRepository = module.get(getRepositoryToken(InvitationEntity))
        companyRepository = module.get(getRepositoryToken(CompanyEntity))
    })

    describe('login', () => {
        it('rejects missing user', async () => {
            userRepository.findOne.mockResolvedValue(null)
            await expect(service.login({ email: 'x@y.z', password: 'pw' })).rejects.toThrow(UnauthorizedException)
        })

        it('rejects wrong password', async () => {
            const passwordHash = await bcrypt.hash('correct', 4)
            userRepository.findOne.mockResolvedValue({
                id: 'u',
                email: 'agent@ahliya.sy',
                passwordHash,
                companyId: mockCompany.id,
                company: mockCompany,
                role: 'agent',
                createdAt: new Date(),
            })
            await expect(
                service.login({ email: 'agent@ahliya.sy', password: 'wrong' })
            ).rejects.toThrow(UnauthorizedException)
        })

        it('rejects a user without a password (invited but never accepted)', async () => {
            userRepository.findOne.mockResolvedValue({
                id: 'u',
                email: 'agent@ahliya.sy',
                passwordHash: null,
                companyId: mockCompany.id,
                company: mockCompany,
                role: 'agent',
                createdAt: new Date(),
            })
            await expect(service.login({ email: 'agent@ahliya.sy', password: 'x' })).rejects.toThrow(
                UnauthorizedException
            )
        })

        it('issues a JWT on successful login', async () => {
            const passwordHash = await bcrypt.hash('correct-pw', 4)
            userRepository.findOne.mockResolvedValue({
                id: 'u',
                email: 'agent@ahliya.sy',
                passwordHash,
                companyId: mockCompany.id,
                company: mockCompany,
                role: 'agent',
                createdAt: new Date(),
            })

            const session = await service.login({ email: 'agent@ahliya.sy', password: 'correct-pw' })

            expect(session.accessToken).toBe('jwt-token')
            expect(session.user).toEqual({
                id: 'u',
                email: 'agent@ahliya.sy',
                companyId: mockCompany.id,
                role: 'agent',
            })
            expect(jwtService.sign).toHaveBeenCalledWith({
                sub: 'u',
                email: 'agent@ahliya.sy',
                companyId: mockCompany.id,
                role: 'agent',
            })
        })
    })

    describe('createInvitation', () => {
        it('rejects unknown company', async () => {
            companyRepository.findOneBy.mockResolvedValue(null)
            await expect(service.createInvitation('a@b.c', 'missing')).rejects.toThrow(NotFoundException)
        })

        it('rejects when a user already exists', async () => {
            companyRepository.findOneBy.mockResolvedValue(mockCompany)
            userRepository.findOneBy.mockResolvedValue({ id: 'u' } as UserEntity)
            await expect(service.createInvitation('a@b.c', mockCompany.id)).rejects.toThrow(ConflictException)
        })

        it('creates a 64-char hex token with a 7-day expiry', async () => {
            companyRepository.findOneBy.mockResolvedValue(mockCompany)
            userRepository.findOneBy.mockResolvedValue(null)
            const before = Date.now()
            const inv = await service.createInvitation('New@B.c', mockCompany.id)
            const after = Date.now()
            expect(inv.token).toMatch(/^[0-9a-f]{64}$/)
            expect(inv.email).toBe('new@b.c')
            const ttl = inv.expiresAt.getTime()
            expect(ttl).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000)
            expect(ttl).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000 + 1000)
        })
    })

    describe('acceptInvitation', () => {
        it('rejects unknown token', async () => {
            invitationRepository.findOne.mockResolvedValue(null)
            await expect(service.acceptInvitation('x', { password: 'abcdefgh' })).rejects.toThrow(
                NotFoundException
            )
        })

        it('rejects expired token with 410 Gone', async () => {
            invitationRepository.findOne.mockResolvedValue(
                buildInvitation({ expiresAt: new Date(Date.now() - 1000) })
            )
            await expect(service.acceptInvitation('x', { password: 'abcdefgh' })).rejects.toThrow(
                GoneException
            )
        })

        it('rejects already-accepted token with 410 Gone', async () => {
            invitationRepository.findOne.mockResolvedValue(
                buildInvitation({ acceptedAt: new Date() })
            )
            await expect(service.acceptInvitation('x', { password: 'abcdefgh' })).rejects.toThrow(
                GoneException
            )
        })

        it('creates the user, hashes the password, and marks invitation accepted', async () => {
            invitationRepository.findOne.mockResolvedValue(buildInvitation())
            userRepository.findOneBy.mockResolvedValue(null)

            const session = await service.acceptInvitation('abc', { password: 'abcdefgh' })

            expect(session.accessToken).toBe('jwt-token')
            expect(userRepository.save).toHaveBeenCalled()
            const savedUser = userRepository.save.mock.calls[0]![0] as Partial<UserEntity>
            expect(savedUser.email).toBe('agent@ahliya.sy')
            expect(savedUser.passwordHash).toMatch(/^\$2/) // bcrypt signature
            const savedInvitation = invitationRepository.save.mock.calls[0]![0] as Partial<InvitationEntity>
            expect(savedInvitation.acceptedAt).toBeInstanceOf(Date)
        })
    })

    describe('getInvitation', () => {
        it('returns email + company name for a valid token', async () => {
            invitationRepository.findOne.mockResolvedValue(buildInvitation())

            const summary = await service.getInvitation('abc')

            expect(summary).toEqual({ email: 'agent@ahliya.sy', companyName: 'الأهلية' })
        })
    })
})
