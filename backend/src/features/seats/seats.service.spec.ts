import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { CompanyEntity } from '../companies/entities/company.entity'
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

    const mockTrip: TripEntity = Object.assign(new TripEntity(), {
        id: 'trip-uuid',
        companyId: mockCompany.id,
        company: mockCompany,
        date: '2026-04-20',
        stations: [],
        segmentPrices: [],
    })

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SeatsService,
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: { findOneBy: jest.fn() },
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
        tripRepository.findOneBy.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([])

        const seats = await service.getSeatsForTrip('trip-uuid')

        expect(seats).toHaveLength(40)
        expect(seats[0]).toEqual({ id: 1, row: 0, col: 0, status: 'available', gender: undefined })
        expect(seats[39]).toEqual({ id: 40, row: 9, col: 3, status: 'available', gender: undefined })
    })

    it('should mark booked seats as occupied with correct gender', async () => {
        tripRepository.findOneBy.mockResolvedValue(mockTrip)
        bookingRepository.find.mockResolvedValue([
            {
                id: 'booking-1',
                reference: 'SY-TEST01',
                tripId: 'trip-uuid',
                seatIds: [5, 6],
                seatDetails: [
                    { id: 5, row: 1, col: 0, gender: 'male' },
                    { id: 6, row: 1, col: 1, gender: 'male' },
                ],
            } as BookingEntity,
        ])

        const seats = await service.getSeatsForTrip('trip-uuid')

        const seat5 = seats.find(s => s.id === 5)!
        const seat6 = seats.find(s => s.id === 6)!
        const seat7 = seats.find(s => s.id === 7)!

        expect(seat5.status).toBe('occupied')
        expect(seat5.gender).toBe('male')
        expect(seat6.status).toBe('occupied')
        expect(seat6.gender).toBe('male')
        expect(seat7.status).toBe('available')
        expect(seat7.gender).toBeUndefined()
    })

    it('should throw NotFoundException for non-existent trip', async () => {
        tripRepository.findOneBy.mockResolvedValue(null)

        await expect(service.getSeatsForTrip('non-existent')).rejects.toThrow(NotFoundException)
    })
})
