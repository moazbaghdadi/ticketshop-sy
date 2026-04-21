import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { DashboardTripsService } from './dashboard-trips.service'
import { CreateDashboardTripDto } from './dto/create-dashboard-trip.dto'
import { CancelledTripDismissalEntity } from './entities/cancelled-trip-dismissal.entity'
import { TripEntity } from './entities/trip.entity'

describe('DashboardTripsService', () => {
    let service: DashboardTripsService
    let repository: jest.Mocked<Repository<TripEntity>>
    let bookingRepository: jest.Mocked<Repository<BookingEntity>>
    let dismissalRepository: jest.Mocked<Repository<CancelledTripDismissalEntity>>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardTripsService,
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: {
                        create: jest.fn((entity: Partial<TripEntity>) => ({ ...entity }) as TripEntity),
                        save: jest.fn(async (entity: Partial<TripEntity>) => ({
                            ...entity,
                            id: entity.id ?? 'new-trip-uuid',
                        }) as TripEntity),
                        findOne: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(BookingEntity),
                    useValue: {
                        update: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(CancelledTripDismissalEntity),
                    useValue: {
                        findOne: jest.fn(),
                        create: jest.fn((e: Partial<CancelledTripDismissalEntity>) => e as CancelledTripDismissalEntity),
                        save: jest.fn(async (e: Partial<CancelledTripDismissalEntity>) => e as CancelledTripDismissalEntity),
                    },
                },
            ],
        }).compile()

        service = module.get<DashboardTripsService>(DashboardTripsService)
        repository = module.get(getRepositoryToken(TripEntity))
        bookingRepository = module.get(getRepositoryToken(BookingEntity))
        dismissalRepository = module.get(getRepositoryToken(CancelledTripDismissalEntity))
    })

    const validDto: CreateDashboardTripDto = {
        date: '2026-04-20',
        stations: [
            { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
            { cityId: 'homs', order: 1, arrivalTime: '07:30', departureTime: '07:40' },
            { cityId: 'aleppo', order: 2, arrivalTime: '09:30', departureTime: null },
        ],
        segmentPrices: [
            { fromCityId: 'damascus', toCityId: 'homs', price: 20000 },
            { fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 },
            { fromCityId: 'homs', toCityId: 'aleppo', price: 28000 },
        ],
    }

    it('creates a trip scoped to the caller’s company', async () => {
        const result = await service.create('company-uuid', validDto)

        expect(result.id).toBe('new-trip-uuid')
        expect(repository.save).toHaveBeenCalled()
        const saved = repository.create.mock.calls[0]![0] as Partial<TripEntity>
        expect(saved.companyId).toBe('company-uuid')
        expect(saved.date).toBe('2026-04-20')
        expect(saved.stations).toHaveLength(3)
        expect(saved.segmentPrices).toHaveLength(3)
    })

    it('rejects routes with unknown cityIds', async () => {
        const dto = {
            ...validDto,
            stations: [
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                { cityId: 'narnia', order: 1, arrivalTime: '09:30', departureTime: null },
            ],
            segmentPrices: [{ fromCityId: 'damascus', toCityId: 'narnia', price: 45000 }],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(BadRequestException)
    })

    it('rejects duplicate cities on the route', async () => {
        const dto = {
            ...validDto,
            stations: [
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                { cityId: 'damascus', order: 1, arrivalTime: '09:30', departureTime: null },
            ],
            segmentPrices: [{ fromCityId: 'damascus', toCityId: 'damascus', price: 45000 }],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(BadRequestException)
    })

    it('rejects missing departureTime on first station', async () => {
        const dto = {
            ...validDto,
            stations: [
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: null },
                { cityId: 'aleppo', order: 1, arrivalTime: '09:30', departureTime: null },
            ],
            segmentPrices: [{ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 }],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(/First station/)
    })

    it('rejects missing arrivalTime on last station', async () => {
        const dto = {
            ...validDto,
            stations: [
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                { cityId: 'aleppo', order: 1, arrivalTime: null, departureTime: null },
            ],
            segmentPrices: [{ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 }],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(/Last station/)
    })

    it('rejects intermediate stations missing arrival or departure', async () => {
        const dto = {
            ...validDto,
            stations: [
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                { cityId: 'homs', order: 1, arrivalTime: null, departureTime: '07:40' },
                { cityId: 'aleppo', order: 2, arrivalTime: '09:30', departureTime: null },
            ],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(/Intermediate station/)
    })

    it('rejects non-monotonic schedules', async () => {
        const dto = {
            ...validDto,
            stations: [
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '09:00' },
                { cityId: 'aleppo', order: 1, arrivalTime: '07:30', departureTime: null },
            ],
            segmentPrices: [{ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 }],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(/non-monotonic/)
    })

    it('rejects when a pair price is missing', async () => {
        const dto = {
            ...validDto,
            segmentPrices: [
                { fromCityId: 'damascus', toCityId: 'homs', price: 20000 },
                { fromCityId: 'homs', toCityId: 'aleppo', price: 28000 },
            ],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(/Missing or non-positive price/)
    })

    it('rejects when a pair price is non-positive', async () => {
        const dto = {
            ...validDto,
            segmentPrices: [
                { fromCityId: 'damascus', toCityId: 'homs', price: 20000 },
                { fromCityId: 'damascus', toCityId: 'aleppo', price: 0 },
                { fromCityId: 'homs', toCityId: 'aleppo', price: 28000 },
            ],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(/Missing or non-positive price/)
    })

    it('rejects duplicate segment prices for the same pair', async () => {
        const dto = {
            ...validDto,
            segmentPrices: [
                ...validDto.segmentPrices,
                { fromCityId: 'damascus', toCityId: 'aleppo', price: 50000 },
            ],
        }
        await expect(service.create('company-uuid', dto)).rejects.toThrow(/Duplicate segment price/)
    })

    describe('cancel', () => {
        it('marks the trip cancelled and its bookings cancelled', async () => {
            const trip = { id: 'trip-uuid', companyId: 'company-uuid', cancelledAt: null, cancelledReason: null } as TripEntity
            repository.findOne.mockResolvedValue(trip)

            const result = await service.cancel('company-uuid', 'trip-uuid', 'weather')

            expect(result.cancelledAt).toBeInstanceOf(Date)
            expect(result.cancelledReason).toBe('weather')
            expect(bookingRepository.update).toHaveBeenCalledWith({ tripId: 'trip-uuid' }, { status: 'cancelled' })
        })

        it('throws NotFoundException for unknown trip', async () => {
            repository.findOne.mockResolvedValue(null)
            await expect(service.cancel('company-uuid', 'missing', 'x')).rejects.toThrow(NotFoundException)
        })

        it('throws ForbiddenException when trip belongs to another company', async () => {
            const trip = { id: 'trip-uuid', companyId: 'other-company', cancelledAt: null } as TripEntity
            repository.findOne.mockResolvedValue(trip)
            await expect(service.cancel('company-uuid', 'trip-uuid', 'x')).rejects.toThrow(ForbiddenException)
        })

        it('is idempotent for already-cancelled trips', async () => {
            const cancelledAt = new Date('2026-04-01T00:00:00Z')
            const trip = { id: 'trip-uuid', companyId: 'company-uuid', cancelledAt, cancelledReason: 'older' } as TripEntity
            repository.findOne.mockResolvedValue(trip)

            const result = await service.cancel('company-uuid', 'trip-uuid', 'newer-reason')

            expect(result.cancelledAt).toBe(cancelledAt)
            expect(result.cancelledReason).toBe('older')
            expect(bookingRepository.update).not.toHaveBeenCalled()
        })
    })

    describe('dismissCancellation', () => {
        it('inserts a dismissal for the current user', async () => {
            repository.findOne.mockResolvedValue({ id: 'trip-uuid', companyId: 'company-uuid' } as TripEntity)
            dismissalRepository.findOne.mockResolvedValue(null)

            await service.dismissCancellation('user-uuid', 'company-uuid', 'trip-uuid')

            expect(dismissalRepository.create).toHaveBeenCalledWith({ userId: 'user-uuid', tripId: 'trip-uuid' })
            expect(dismissalRepository.save).toHaveBeenCalled()
        })

        it('is idempotent when already dismissed', async () => {
            repository.findOne.mockResolvedValue({ id: 'trip-uuid', companyId: 'company-uuid' } as TripEntity)
            dismissalRepository.findOne.mockResolvedValue({ id: 'd1' } as CancelledTripDismissalEntity)

            await service.dismissCancellation('user-uuid', 'company-uuid', 'trip-uuid')

            expect(dismissalRepository.save).not.toHaveBeenCalled()
        })

        it('rejects dismissals for trips from other companies', async () => {
            repository.findOne.mockResolvedValue({ id: 'trip-uuid', companyId: 'other' } as TripEntity)
            await expect(service.dismissCancellation('user-uuid', 'company-uuid', 'trip-uuid')).rejects.toThrow(ForbiddenException)
        })
    })
})
