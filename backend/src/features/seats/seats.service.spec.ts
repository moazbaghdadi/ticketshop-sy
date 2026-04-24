import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { CompanyEntity } from '../companies/entities/company.entity'
import { TripStationEntity } from '../trips/entities/trip-station.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { SeatsService } from './seats.service'

describe('SeatsService', () => {
    let service: SeatsService
    let tripRepository: jest.Mocked<Repository<TripEntity>>
    let bookingRepository: jest.Mocked<Repository<BookingEntity>>

    const mockCompany: CompanyEntity = {
        id: 'company-uuid',
        nameAr: 'الأهلية',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    }

    const stations: TripStationEntity[] = [
        Object.assign(new TripStationEntity(), { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' }),
        Object.assign(new TripStationEntity(), { cityId: 'homs', order: 1, arrivalTime: '07:30', departureTime: '07:40' }),
        Object.assign(new TripStationEntity(), { cityId: 'aleppo', order: 2, arrivalTime: '09:30', departureTime: null }),
    ]

    const mockTrip: TripEntity = Object.assign(new TripEntity(), {
        id: 'trip-uuid',
        companyId: mockCompany.id,
        company: mockCompany,
        date: '2026-04-20',
        stations,
        segmentPrices: [],
    })

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SeatsService,
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: { findOne: jest.fn() },
                },
                {
                    provide: getRepositoryToken(BookingEntity),
                    useValue: { find: jest.fn() },
                },
            ],
        }).compile()

        service = module.get<SeatsService>(SeatsService)
        tripRepository = module.get(getRepositoryToken(TripEntity))
        bookingRepository = module.get(getRepositoryToken(BookingEntity))
    })

    it('should return 40 seats with correct structure', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])

        const seats = await service.getSeatsForTrip('trip-uuid')

        expect(seats).toHaveLength(40)
        expect(seats[0]).toEqual({ id: 1, row: 0, col: 0, status: 'available', gender: undefined })
        expect(seats[39]).toEqual({ id: 40, row: 9, col: 3, status: 'available', gender: undefined })
    })

    it('should mark booked seats as occupied with correct gender', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([
            {
                id: 'booking-1',
                reference: 'SY-TEST01',
                tripId: 'trip-uuid',
                boardingStationId: 'damascus',
                dropoffStationId: 'aleppo',
                seatIds: [5, 6],
                seatDetails: [
                    { id: 5, row: 1, col: 0, gender: 'male' },
                    { id: 6, row: 1, col: 1, gender: 'male' },
                ],
            } as BookingEntity,
        ])

        const seats = await service.getSeatsForTrip('trip-uuid')

        expect(seats.find(s => s.id === 5)).toMatchObject({ status: 'occupied', gender: 'male' })
        expect(seats.find(s => s.id === 6)).toMatchObject({ status: 'occupied', gender: 'male' })
        expect(seats.find(s => s.id === 7)).toMatchObject({ status: 'available', gender: undefined })
    })

    it('should throw NotFoundException for non-existent trip', async () => {
        tripRepository.findOne.mockResolvedValue(null)

        await expect(service.getSeatsForTrip('non-existent')).rejects.toThrow(NotFoundException)
    })

    it('frees a seat for a non-overlapping segment when both segment params are provided', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        // Existing booking on damascus→homs (order 0→1). Request for homs→aleppo (order 1→2) does not overlap.
        bookingRepository.find.mockResolvedValue([
            {
                id: 'booking-1',
                tripId: 'trip-uuid',
                boardingStationId: 'damascus',
                dropoffStationId: 'homs',
                seatIds: [10],
                seatDetails: [{ id: 10, row: 2, col: 1, gender: 'female' }],
            } as BookingEntity,
        ])

        const seats = await service.getSeatsForTrip('trip-uuid', {
            boardingStationId: 'homs',
            dropoffStationId: 'aleppo',
        })
        expect(seats.find(s => s.id === 10)).toMatchObject({ status: 'available' })
    })

    it('marks a seat occupied for an overlapping segment', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        // Existing booking on damascus→aleppo overlaps homs→aleppo.
        bookingRepository.find.mockResolvedValue([
            {
                id: 'booking-1',
                tripId: 'trip-uuid',
                boardingStationId: 'damascus',
                dropoffStationId: 'aleppo',
                seatIds: [10],
                seatDetails: [{ id: 10, row: 2, col: 1, gender: 'female' }],
            } as BookingEntity,
        ])

        const seats = await service.getSeatsForTrip('trip-uuid', {
            boardingStationId: 'homs',
            dropoffStationId: 'aleppo',
        })
        expect(seats.find(s => s.id === 10)).toMatchObject({ status: 'occupied', gender: 'female' })
    })

    it('throws BadRequestException when only one segment param is given', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])

        await expect(
            service.getSeatsForTrip('trip-uuid', { boardingStationId: 'damascus' })
        ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException for an unknown station id', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])

        await expect(
            service.getSeatsForTrip('trip-uuid', {
                boardingStationId: 'nowhere',
                dropoffStationId: 'aleppo',
            })
        ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when boarding does not precede dropoff', async () => {
        tripRepository.findOne.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])

        await expect(
            service.getSeatsForTrip('trip-uuid', {
                boardingStationId: 'aleppo',
                dropoffStationId: 'damascus',
            })
        ).rejects.toThrow(BadRequestException)
    })
})
