import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TripEntity } from '../trips/entities/trip.entity'
import { BookingsService } from './bookings.service'
import { CreateBookingDto } from './dto/create-booking.dto'
import { BookingEntity } from './entities/booking.entity'

describe('BookingsService', () => {
    let service: BookingsService
    let bookingRepository: jest.Mocked<Repository<BookingEntity>>
    let tripRepository: jest.Mocked<Repository<TripEntity>>

    const mockTrip: TripEntity = {
        id: 'trip-uuid',
        fromCityId: 'damascus',
        toCityId: 'aleppo',
        company: 'الأهلية',
        departureTime: '06:00',
        arrivalTime: '09:30',
        duration: '3 ساعات و 30 دقيقة',
        durationMinutes: 210,
        stops: 1,
        price: 45000,
        date: '2026-04-20',
    }

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
                        findOneBy: jest.fn(),
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

    it('should create a booking successfully', async () => {
        tripRepository.findOneBy.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.findOne.mockResolvedValue(null) // reference is unique

        const result = await service.createBooking(validDto)

        expect(result.trip.from.nameAr).toBe('دمشق')
        expect(result.trip.to.nameAr).toBe('حلب')
        expect(result.totalPrice).toBe(45000)
        expect(result.seats).toEqual([5])
        expect(result.status).toBe('confirmed')
        expect(result.reference).toMatch(/^SY-[0-9A-F]{6}$/)
    })

    it('should throw NotFoundException for non-existent trip', async () => {
        tripRepository.findOneBy.mockResolvedValue(null)

        await expect(service.createBooking(validDto)).rejects.toThrow(NotFoundException)
    })

    it('should throw ConflictException for occupied seat', async () => {
        tripRepository.findOneBy.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([
            {
                seatDetails: [{ id: 5, row: 1, col: 0, gender: 'female' }],
            } as BookingEntity,
        ])

        await expect(service.createBooking(validDto)).rejects.toThrow(ConflictException)
    })

    it('should throw UnprocessableEntityException for gender conflict', async () => {
        tripRepository.findOneBy.mockResolvedValue(mockTrip)
        // Seat 5 is row 1, col 0. Seat 6 is row 1, col 1 (same side-pair).
        // If seat 6 is occupied by female, booking seat 5 as male conflicts.
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

    it('should allow same-gender booking on same side', async () => {
        tripRepository.findOneBy.mockResolvedValue(mockTrip)
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

    it('should calculate total price correctly for multiple seats', async () => {
        tripRepository.findOneBy.mockResolvedValue(mockTrip)
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
