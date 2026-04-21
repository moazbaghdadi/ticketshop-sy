import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
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
                cityId: 'aleppo',
                order: 1,
                arrivalTime: '09:30',
                departureTime: null,
            }),
        ] as TripStationEntity[],
        segmentPrices: [
            Object.assign(new TripSegmentPriceEntity(), {
                fromCityId: 'damascus',
                toCityId: 'aleppo',
                price: 45000,
            }),
        ] as TripSegmentPriceEntity[],
    })

    beforeEach(async () => {
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
            ],
        }).compile()

        service = module.get<BookingsService>(BookingsService)
        bookingRepository = module.get(getRepositoryToken(BookingEntity))
        tripRepository = module.get(getRepositoryToken(TripEntity))
    })

    const validDto: CreateBookingDto = {
        tripId: 'trip-uuid',
        seatSelections: [{ seatId: 5, gender: 'male' }],
        paymentMethod: 'sham-cash',
    }

    it('creates a booking using the origin→terminus pair price', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.findOne.mockResolvedValue(null)

        const result = await service.createBooking(validDto)

        expect(result.trip.from.nameAr).toBe('دمشق')
        expect(result.trip.to.nameAr).toBe('حلب')
        expect(result.trip.company).toEqual({ id: mockCompany.id, nameAr: 'الأهلية' })
        expect(result.trip.stations).toHaveLength(2)
        expect(result.totalPrice).toBe(45000)
        expect(result.seats).toEqual([5])
        expect(result.status).toBe('confirmed')
        expect(result.reference).toMatch(/^SY-[0-9A-F]{6}$/)
    })

    it('throws NotFoundException for non-existent trip', async () => {
        tripRepository.findOne.mockResolvedValue(null)
        await expect(service.createBooking(validDto)).rejects.toThrow(NotFoundException)
    })

    it('throws UnprocessableEntityException when origin→terminus has no price', async () => {
        const broken = Object.assign(new TripEntity(), {
            ...mockTrip,
            segmentPrices: [],
        })
        tripRepository.findOne.mockResolvedValue(broken)
        await expect(service.createBooking(validDto)).rejects.toThrow(UnprocessableEntityException)
    })

    it('throws ConflictException for occupied seat', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([
            {
                seatDetails: [{ id: 5, row: 1, col: 0, gender: 'female' }],
            } as BookingEntity,
        ])
        await expect(service.createBooking(validDto)).rejects.toThrow(ConflictException)
    })

    it('throws UnprocessableEntityException for gender conflict', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([
            {
                seatDetails: [{ id: 6, row: 1, col: 1, gender: 'female' }],
            } as BookingEntity,
        ])

        const dto: CreateBookingDto = {
            tripId: 'trip-uuid',
            seatSelections: [{ seatId: 5, gender: 'male' }],
            paymentMethod: 'sham-cash',
        }

        await expect(service.createBooking(dto)).rejects.toThrow(UnprocessableEntityException)
    })

    it('allows same-gender booking on same side', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([
            {
                seatDetails: [{ id: 6, row: 1, col: 1, gender: 'male' }],
            } as BookingEntity,
        ])
        bookingRepository.findOne.mockResolvedValue(null)

        const dto: CreateBookingDto = {
            tripId: 'trip-uuid',
            seatSelections: [{ seatId: 5, gender: 'male' }],
            paymentMethod: 'sham-cash',
        }

        const result = await service.createBooking(dto)
        expect(result.status).toBe('confirmed')
    })

    it('multiplies pair price by seat count', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.findOne.mockResolvedValue(null)

        const dto: CreateBookingDto = {
            tripId: 'trip-uuid',
            seatSelections: [
                { seatId: 5, gender: 'male' },
                { seatId: 6, gender: 'male' },
            ],
            paymentMethod: 'sham-cash',
        }

        const result = await service.createBooking(dto)
        expect(result.totalPrice).toBe(90000)
        expect(result.seats).toEqual([5, 6])
    })
})
