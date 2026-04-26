import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { TripEntity } from '../trips/entities/trip.entity'
import { DriversService } from './drivers.service'
import { DriverEntity } from './entities/driver.entity'

interface MockQB {
    where: jest.Mock
    andWhere: jest.Mock
    orderBy: jest.Mock
    select: jest.Mock
    limit: jest.Mock
    update: jest.Mock
    set: jest.Mock
    execute: jest.Mock
    getMany: jest.Mock
    getCount: jest.Mock
    getOne: jest.Mock
}

function makeQB(): MockQB {
    const qb: MockQB = {
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        select: jest.fn(() => qb),
        limit: jest.fn(() => qb),
        update: jest.fn(() => qb),
        set: jest.fn(() => qb),
        execute: jest.fn(async () => undefined),
        getMany: jest.fn(async () => []),
        getCount: jest.fn(async () => 0),
        getOne: jest.fn(async () => null),
    }
    return qb
}

describe('DriversService', () => {
    let service: DriversService
    let driverRepo: jest.Mocked<Repository<DriverEntity>>
    let tripRepo: jest.Mocked<Repository<TripEntity>>
    let driverQB: MockQB
    let tripQB: MockQB
    let dataSource: { transaction: jest.Mock }
    let txManager: { update: jest.Mock; createQueryBuilder: jest.Mock }
    let txQB: MockQB

    const driver = (over: Partial<DriverEntity> = {}): DriverEntity =>
        ({
            id: 'd-1',
            companyId: 'c-1',
            nameAr: 'سائق ١',
            deletedAt: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            ...over,
        }) as DriverEntity

    beforeEach(async () => {
        driverQB = makeQB()
        tripQB = makeQB()
        txQB = makeQB()

        txManager = {
            update: jest.fn(async () => undefined),
            createQueryBuilder: jest.fn(() => txQB),
        }

        dataSource = {
            transaction: jest.fn(async (cb: (m: typeof txManager) => Promise<unknown>) => {
                return cb(txManager)
            }),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DriversService,
                {
                    provide: getRepositoryToken(DriverEntity),
                    useValue: {
                        createQueryBuilder: jest.fn(() => driverQB),
                        findOne: jest.fn(),
                        create: jest.fn((e: Partial<DriverEntity>) => e as DriverEntity),
                        save: jest.fn(async (e: Partial<DriverEntity>) =>
                            ({ id: 'd-new', createdAt: new Date(), ...e }) as DriverEntity
                        ),
                    },
                },
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: {
                        createQueryBuilder: jest.fn(() => tripQB),
                    },
                },
                {
                    provide: DataSource,
                    useValue: dataSource,
                },
            ],
        }).compile()

        service = module.get(DriversService)
        driverRepo = module.get(getRepositoryToken(DriverEntity))
        tripRepo = module.get(getRepositoryToken(TripEntity))
    })

    describe('create / findOrCreate', () => {
        it('creates a new driver when no active match exists (case-insensitive trim)', async () => {
            driverQB.getOne.mockResolvedValueOnce(null)
            const result = await service.create('c-1', '  أحمد  ')

            expect(driverRepo.create).toHaveBeenCalledWith({ companyId: 'c-1', nameAr: 'أحمد', deletedAt: null })
            expect(driverRepo.save).toHaveBeenCalled()
            expect(result.nameAr).toBe('أحمد')
        })

        it('returns the existing active driver instead of creating a duplicate', async () => {
            const existing = driver({ id: 'existing-id', nameAr: 'أحمد' })
            driverQB.getOne.mockResolvedValueOnce(existing)

            const result = await service.create('c-1', 'أحمد')

            expect(driverRepo.save).not.toHaveBeenCalled()
            expect(result.id).toBe('existing-id')
        })

        it('rejects blank names', async () => {
            await expect(service.create('c-1', '   ')).rejects.toThrow(BadRequestException)
        })

        it('findOrCreate creates when name not found, returns existing when found', async () => {
            driverQB.getOne.mockResolvedValueOnce(null)
            await service.findOrCreate('c-1', 'جديد')
            expect(driverRepo.save).toHaveBeenCalled()

            jest.clearAllMocks()
            const existing = driver({ id: 'existing-id', nameAr: 'جديد' })
            driverQB.getOne.mockResolvedValueOnce(existing)
            const result = await service.findOrCreate('c-1', 'جديد')
            expect(result.id).toBe('existing-id')
            expect(driverRepo.save).not.toHaveBeenCalled()
        })
    })

    describe('list', () => {
        it('orders by nameAr asc and filters out soft-deleted', async () => {
            driverQB.getMany.mockResolvedValueOnce([driver()])
            const result = await service.list('c-1')

            expect(driverQB.where).toHaveBeenCalledWith('d.companyId = :companyId', { companyId: 'c-1' })
            expect(driverQB.andWhere).toHaveBeenCalledWith('d.deletedAt IS NULL')
            expect(driverQB.orderBy).toHaveBeenCalledWith('d.nameAr', 'ASC')
            expect(result).toHaveLength(1)
        })

        it('applies ILIKE substring on query', async () => {
            driverQB.getMany.mockResolvedValueOnce([])
            await service.list('c-1', '  أحم  ')
            expect(driverQB.andWhere).toHaveBeenCalledWith('d.nameAr ILIKE :q', { q: '%أحم%' })
        })
    })

    describe('get / resolveActive', () => {
        it('returns driver when found and active and same company', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver())
            const dto = await service.get('c-1', 'd-1')
            expect(dto.id).toBe('d-1')
        })

        it('throws 404 when missing', async () => {
            driverRepo.findOne.mockResolvedValueOnce(null)
            await expect(service.get('c-1', 'd-1')).rejects.toThrow(NotFoundException)
        })

        it('throws 404 when soft-deleted', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver({ deletedAt: new Date() }))
            await expect(service.get('c-1', 'd-1')).rejects.toThrow(NotFoundException)
        })

        it('throws 403 when from another company', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver({ companyId: 'other' }))
            await expect(service.get('c-1', 'd-1')).rejects.toThrow(ForbiddenException)
        })

        it('resolveActive enforces same checks', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver({ deletedAt: new Date() }))
            await expect(service.resolveActive('c-1', 'd-1')).rejects.toThrow(NotFoundException)
        })
    })

    describe('update', () => {
        it('renames a driver and persists', async () => {
            const d = driver()
            driverRepo.findOne.mockResolvedValueOnce(d)
            driverQB.getOne.mockResolvedValueOnce(null) // no collision

            const result = await service.update('c-1', 'd-1', '  محمد  ')

            expect(driverRepo.save).toHaveBeenCalled()
            expect(result.nameAr).toBe('محمد')
        })

        it('409s when another active driver already has the new name', async () => {
            const d = driver()
            driverRepo.findOne.mockResolvedValueOnce(d)
            driverQB.getOne.mockResolvedValueOnce(driver({ id: 'd-2' }))

            await expect(service.update('c-1', 'd-1', 'محمد')).rejects.toThrow(ConflictException)
        })

        it('rejects cross-company edits', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver({ companyId: 'other' }))
            await expect(service.update('c-1', 'd-1', 'x')).rejects.toThrow(ForbiddenException)
        })

        it('rejects blank names', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver())
            await expect(service.update('c-1', 'd-1', '   ')).rejects.toThrow(BadRequestException)
        })
    })

    describe('remove (soft delete)', () => {
        it('soft-deletes a driver with no upcoming refs', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver())
            tripQB.getMany.mockResolvedValueOnce([])
            tripQB.getCount.mockResolvedValueOnce(0)

            await service.remove('c-1', 'd-1')

            expect(dataSource.transaction).toHaveBeenCalled()
            expect(txManager.update).toHaveBeenCalledWith(DriverEntity, { id: 'd-1' }, expect.objectContaining({ deletedAt: expect.any(Date) }))
            expect(txManager.createQueryBuilder).not.toHaveBeenCalled()
        })

        it('409s with conflict info when upcoming refs exist and no replacement is given', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver())
            tripQB.getMany.mockResolvedValueOnce([
                { id: 't1', date: '2030-01-01' } as TripEntity,
                { id: 't2', date: '2030-01-02' } as TripEntity,
            ])
            tripQB.getCount.mockResolvedValueOnce(2)

            try {
                await service.remove('c-1', 'd-1')
                fail('expected ConflictException')
            } catch (e: unknown) {
                expect(e).toBeInstanceOf(ConflictException)
                const err = e as ConflictException
                const response = err.getResponse() as { upcomingTripCount: number; sampleTripDates: string[] }
                expect(response.upcomingTripCount).toBe(2)
                expect(response.sampleTripDates).toEqual(['2030-01-01', '2030-01-02'])
            }
            expect(txManager.update).not.toHaveBeenCalled()
        })

        it('reassigns and soft-deletes in one transaction when replacement is given', async () => {
            driverRepo.findOne
                .mockResolvedValueOnce(driver())
                .mockResolvedValueOnce(driver({ id: 'd-2', nameAr: 'بديل' }))
            tripQB.getMany.mockResolvedValueOnce([
                { id: 't1', date: '2030-01-01' } as TripEntity,
            ])
            tripQB.getCount.mockResolvedValueOnce(1)

            await service.remove('c-1', 'd-1', 'd-2')

            expect(dataSource.transaction).toHaveBeenCalled()
            expect(txManager.createQueryBuilder).toHaveBeenCalled()
            expect(txQB.update).toHaveBeenCalledWith(TripEntity)
            expect(txQB.set).toHaveBeenCalledWith({ driverId: 'd-2' })
            expect(txQB.where).toHaveBeenCalledWith(
                'driverId = :id AND date >= CURRENT_DATE AND cancelledAt IS NULL',
                { id: 'd-1' }
            )
            expect(txManager.update).toHaveBeenCalledWith(DriverEntity, { id: 'd-1' }, expect.objectContaining({ deletedAt: expect.any(Date) }))
        })

        it('rejects when replacement is the same driver', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver())
            tripQB.getMany.mockResolvedValueOnce([])
            tripQB.getCount.mockResolvedValueOnce(0)

            await expect(service.remove('c-1', 'd-1', 'd-1')).rejects.toThrow(BadRequestException)
        })

        it('rejects when replacement is missing or soft-deleted', async () => {
            driverRepo.findOne
                .mockResolvedValueOnce(driver())
                .mockResolvedValueOnce(null)
            tripQB.getMany.mockResolvedValueOnce([])
            tripQB.getCount.mockResolvedValueOnce(0)

            await expect(service.remove('c-1', 'd-1', 'd-2')).rejects.toThrow(NotFoundException)
        })

        it('rejects when replacement is from another company', async () => {
            driverRepo.findOne
                .mockResolvedValueOnce(driver())
                .mockResolvedValueOnce(driver({ id: 'd-2', companyId: 'other' }))
            tripQB.getMany.mockResolvedValueOnce([])
            tripQB.getCount.mockResolvedValueOnce(0)

            await expect(service.remove('c-1', 'd-1', 'd-2')).rejects.toThrow(ForbiddenException)
        })

        it('404s if the driver is missing', async () => {
            driverRepo.findOne.mockResolvedValueOnce(null)
            await expect(service.remove('c-1', 'd-1')).rejects.toThrow(NotFoundException)
        })

        it('404s if the driver is already soft-deleted', async () => {
            driverRepo.findOne.mockResolvedValueOnce(driver({ deletedAt: new Date() }))
            await expect(service.remove('c-1', 'd-1')).rejects.toThrow(NotFoundException)
        })
    })

    void tripRepo
})
