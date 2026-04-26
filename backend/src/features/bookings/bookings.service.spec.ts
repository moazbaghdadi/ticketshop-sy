import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { CompanyEntity } from '../companies/entities/company.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { TripSegmentPriceEntity } from '../trips/entities/trip-segment-price.entity'
import { TripStationEntity } from '../trips/entities/trip-station.entity'
import { BookingsService } from './bookings.service'
import { CreateBookingDto } from './dto/create-booking.dto'
import { BookingEntity } from './entities/booking.entity'

describe('BookingsService', () => {
    let service: BookingsService
    let bookingRepository: jest.Mocked<Repository<BookingEntity>>
    let tripRepository: jest.Mocked<Repository<TripEntity>>
    let manager: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock; getRepository: jest.Mock }

    const mockCompany: CompanyEntity = {
        id: 'company-uuid',
        nameAr: 'الأهلية',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    }

    const mockTrip: TripEntity = Object.assign(new TripEntity(), {
        id: 'trip-uuid',
        companyId: mockCompany.id,
        company: mockCompany,
        date: '2026-04-20',
        stations: [
            Object.assign(new TripStationEntity(), {
                cityId: 'damascus',
                order: 0,
                arrivalTime: null,
                departureTime: '06:00',
            }),
            Object.assign(new TripStationEntity(), {
                cityId: 'homs',
                order: 1,
                arrivalTime: '07:30',
                departureTime: '07:40',
            }),
            Object.assign(new TripStationEntity(), {
                cityId: 'aleppo',
                order: 2,
                arrivalTime: '09:30',
                departureTime: null,
            }),
        ] as TripStationEntity[],
        segmentPrices: [
            Object.assign(new TripSegmentPriceEntity(), {
                fromCityId: 'damascus',
                toCityId: 'homs',
                price: 20000,
            }),
            Object.assign(new TripSegmentPriceEntity(), {
                fromCityId: 'damascus',
                toCityId: 'aleppo',
                price: 45000,
            }),
            Object.assign(new TripSegmentPriceEntity(), {
                fromCityId: 'homs',
                toCityId: 'aleppo',
                price: 28000,
            }),
        ] as TripSegmentPriceEntity[],
    })

    const validPassenger = { name: 'أحمد علي', phone: '+963900000000', email: 'ahmad@example.com' }

    const validDto: CreateBookingDto = {
        tripId: 'trip-uuid',
        seatSelections: [{ seatId: 5, gender: 'male' }],
        paymentMethod: 'sham-cash',
        boardingStationId: 'damascus',
        dropoffStationId: 'aleppo',
        passenger: validPassenger,
    }

    beforeEach(async () => {
        manager = {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn((_entity, data: Partial<BookingEntity>) => data),
            save: jest.fn((entity: Partial<BookingEntity>) => ({
                ...entity,
                id: 'booking-uuid',
                createdAt: new Date('2026-04-20T10:00:00Z'),
            })),
            getRepository: jest.fn(),
        }

        const dataSource = {
            transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(manager as unknown as EntityManager)),
        } as unknown as DataSource

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BookingsService,
                {
                    provide: getRepositoryToken(BookingEntity),
                    useValue: {
                        find: jest.fn(),
                        findOne: jest.fn(),
                        create: jest.fn((entity: Partial<BookingEntity>) => entity),
                        save: jest.fn((entity: Partial<BookingEntity>) => ({
                            ...entity,
                            id: 'booking-uuid',
                            createdAt: new Date('2026-04-20T10:00:00Z'),
                        })),
                    },
                },
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: {
                        findOne: jest.fn(),
                    },
                },
                {
                    provide: getDataSourceToken(),
                    useValue: dataSource,
                },
            ],
        }).compile()

        service = module.get<BookingsService>(BookingsService)
        bookingRepository = module.get(getRepositoryToken(BookingEntity))
        tripRepository = module.get(getRepositoryToken(TripEntity))

        // Route the manager's per-entity operations to the right mocks.
        manager.getRepository.mockImplementation((entity: unknown) => {
            if (entity === BookingEntity) return bookingRepository
            if (entity === TripEntity) return tripRepository
            throw new Error(`Unexpected entity in manager.getRepository: ${String(entity)}`)
        })
        manager.findOne.mockImplementation((entity: unknown, options: unknown) => {
            if (entity === TripEntity) return tripRepository.findOne(options as never)
            if (entity === BookingEntity) return bookingRepository.findOne(options as never)
            throw new Error(`Unexpected entity in manager.findOne: ${String(entity)}`)
        })
        manager.find.mockImplementation((entity: unknown, options: unknown) => {
            if (entity === BookingEntity) return bookingRepository.find(options as never)
            throw new Error(`Unexpected entity in manager.find: ${String(entity)}`)
        })
    })

    it('creates a booking with the boarding→dropoff pair price', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.findOne.mockResolvedValue(null)

        const result = await service.createBooking(validDto)

        expect(result.trip.from.id).toBe('damascus')
        expect(result.trip.to.id).toBe('aleppo')
        expect(result.totalPrice).toBe(45000)
        expect(result.boardingStationId).toBe('damascus')
        expect(result.dropoffStationId).toBe('aleppo')
        expect(result.passenger).toEqual(validPassenger)
        expect(result.reference).toMatch(/^SY-[0-9A-F]{6}$/)
    })

    it('uses the intermediate pair price when boarding/dropoff is a segment', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.findOne.mockResolvedValue(null)

        const dto: CreateBookingDto = {
            ...validDto,
            boardingStationId: 'homs',
            dropoffStationId: 'aleppo',
        }
        const result = await service.createBooking(dto)
        expect(result.totalPrice).toBe(28000)
        expect(result.trip.from.id).toBe('homs')
        expect(result.trip.to.id).toBe('aleppo')
        expect(result.trip.departureTime).toBe('07:40')
    })

    it('persists null email when no passenger email is given', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.findOne.mockResolvedValue(null)

        const dto: CreateBookingDto = {
            ...validDto,
            passenger: { name: 'راميا', phone: '+963911111111' },
        }
        const result = await service.createBooking(dto)
        expect(result.passenger.email).toBeNull()
    })

    it('throws NotFoundException for non-existent trip', async () => {
        tripRepository.findOne.mockResolvedValue(null)
        await expect(service.createBooking(validDto)).rejects.toThrow(NotFoundException)
    })

    it('rejects cash payment on the customer-facing createBooking', async () => {
        const dto: CreateBookingDto = { ...validDto, paymentMethod: 'cash' }
        await expect(service.createBooking(dto)).rejects.toThrow(BadRequestException)
        expect(tripRepository.findOne).not.toHaveBeenCalled()
    })

    it('accepts cash payment via createBookingInternal (dashboard path)', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.findOne.mockResolvedValue(null)

        const dto: CreateBookingDto = { ...validDto, paymentMethod: 'cash' }
        const { booking } = await service.createBookingInternal(dto, { enforceGender: false })
        expect(booking.paymentMethod).toBe('cash')
    })

    it('throws BadRequestException when boarding is not on the trip', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        const dto = { ...validDto, boardingStationId: 'latakia' }
        await expect(service.createBooking(dto)).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when boarding comes after dropoff', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        const dto = { ...validDto, boardingStationId: 'aleppo', dropoffStationId: 'damascus' }
        await expect(service.createBooking(dto)).rejects.toThrow(BadRequestException)
    })

    it('throws ConflictException for occupied seat', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([
            {
                boardingStationId: 'damascus',
                dropoffStationId: 'aleppo',
                seatDetails: [{ id: 5, row: 1, col: 0, gender: 'female' }],
            } as BookingEntity,
        ])
        await expect(service.createBooking(validDto)).rejects.toThrow(ConflictException)
    })

    it('throws UnprocessableEntityException for gender conflict', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([
            {
                boardingStationId: 'damascus',
                dropoffStationId: 'aleppo',
                seatDetails: [{ id: 6, row: 1, col: 1, gender: 'female' }],
            } as BookingEntity,
        ])

        await expect(service.createBooking(validDto)).rejects.toThrow(UnprocessableEntityException)
    })

    it('allows reusing a seat on a non-overlapping segment', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        // An existing booking on damascus→homs (orders 0→1) must not block a new
        // booking on homs→aleppo (orders 1→2) for the same seat — segments are disjoint.
        bookingRepository.find.mockResolvedValue([
            {
                boardingStationId: 'damascus',
                dropoffStationId: 'homs',
                seatDetails: [{ id: 5, row: 1, col: 0, gender: 'female' }],
            } as BookingEntity,
        ])
        bookingRepository.findOne.mockResolvedValue(null)

        const dto: CreateBookingDto = {
            ...validDto,
            boardingStationId: 'homs',
            dropoffStationId: 'aleppo',
            seatSelections: [{ seatId: 5, gender: 'male' }],
        }

        const result = await service.createBooking(dto)
        expect(result.seats).toEqual([5])
    })

    it('multiplies pair price by seat count', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.findOne.mockResolvedValue(null)

        const dto: CreateBookingDto = {
            ...validDto,
            seatSelections: [
                { seatId: 5, gender: 'male' },
                { seatId: 6, gender: 'male' },
            ],
        }

        const result = await service.createBooking(dto)
        expect(result.totalPrice).toBe(90000)
        expect(result.seats).toEqual([5, 6])
    })
})
