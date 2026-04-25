import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { CancelledTripDismissalEntity } from '../trips/entities/cancelled-trip-dismissal.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { DashboardOverviewService } from './dashboard-overview.service'

describe('DashboardOverviewService', () => {
    let service: DashboardOverviewService
    let tripRepository: jest.Mocked<Repository<TripEntity>>
    let bookingRepository: jest.Mocked<Repository<BookingEntity>>
    let dismissalRepository: jest.Mocked<Repository<CancelledTripDismissalEntity>>

    const makeQb = (records: BookingEntity[], sum = 0): SelectQueryBuilder<BookingEntity> => {
        const qb = {
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
            addGroupBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue(records),
            getRawOne: jest.fn().mockResolvedValue({ sum: String(sum) }),
            getRawMany: jest.fn().mockResolvedValue([]),
        }
        return qb as unknown as SelectQueryBuilder<BookingEntity>
    }

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardOverviewService,
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: { find: jest.fn() },
                },
                {
                    provide: getRepositoryToken(BookingEntity),
                    useValue: {
                        find: jest.fn(),
                        createQueryBuilder: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(CancelledTripDismissalEntity),
                    useValue: { find: jest.fn() },
                },
            ],
        }).compile()

        service = module.get(DashboardOverviewService)
        tripRepository = module.get(getRepositoryToken(TripEntity))
        bookingRepository = module.get(getRepositoryToken(BookingEntity))
        dismissalRepository = module.get(getRepositoryToken(CancelledTripDismissalEntity))
    })

    it('returns upcoming trips with booking and seat counts for the caller’s company only', async () => {
        tripRepository.find.mockImplementation(async opts => {
            const where = opts?.where as { companyId: string }
            if (where.companyId !== 'company-uuid') return []
            if (opts?.order && (opts.order as { date?: 'ASC' }).date === 'ASC') {
                return [
                    {
                        id: 'trip-1',
                        date: '2026-04-25',
                        companyId: 'company-uuid',
                        stations: [
                            { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                            { cityId: 'aleppo', order: 1, arrivalTime: '09:30', departureTime: null },
                        ],
                        company: { id: 'company-uuid', nameAr: 'الأهلية' },
                    } as unknown as TripEntity,
                ]
            }
            return []
        })

        bookingRepository.find.mockResolvedValue([
            { tripId: 'trip-1', seatIds: [1, 2] } as BookingEntity,
            { tripId: 'trip-1', seatIds: [7] } as BookingEntity,
        ])
        bookingRepository.createQueryBuilder.mockReturnValue(makeQb([], 0))
        dismissalRepository.find.mockResolvedValue([])

        const overview = await service.getOverview('user-uuid', 'company-uuid')

        expect(overview.upcomingTrips).toHaveLength(1)
        expect(overview.upcomingTrips[0]!.bookingsCount).toBe(2)
        expect(overview.upcomingTrips[0]!.seatsSold).toBe(3)
        expect(overview.upcomingTrips[0]!.fromCity).toBe('دمشق')
        expect(overview.upcomingTrips[0]!.toCity).toBe('حلب')
    })

    it('returns the latest sales ordered by createdAt desc', async () => {
        tripRepository.find.mockResolvedValue([])
        bookingRepository.find.mockResolvedValue([])
        dismissalRepository.find.mockResolvedValue([])
        bookingRepository.createQueryBuilder.mockReturnValue(
            makeQb(
                [
                    {
                        reference: 'SY-AAA',
                        totalPrice: 45000,
                        passengerName: 'أحمد',
                        seatIds: [1],
                        tripSnapshot: { date: '2026-04-25' },
                        createdAt: new Date('2026-04-20T09:00:00Z'),
                    } as unknown as BookingEntity,
                ],
                45000,
            ),
        )

        const overview = await service.getOverview('user-uuid', 'company-uuid')
        expect(overview.latestSales).toHaveLength(1)
        expect(overview.latestSales[0]!.reference).toBe('SY-AAA')
        expect(overview.latestSales[0]!.totalPrice).toBe(45000)
    })

    it('returns the company balance as the sum of confirmed bookings', async () => {
        tripRepository.find.mockResolvedValue([])
        bookingRepository.find.mockResolvedValue([])
        dismissalRepository.find.mockResolvedValue([])
        bookingRepository.createQueryBuilder.mockReturnValue(makeQb([], 120000))

        const overview = await service.getOverview('user-uuid', 'company-uuid')
        expect(overview.balance).toBe(120000)
    })

    it('excludes cancelled trips that the user has dismissed', async () => {
        tripRepository.find.mockImplementation(async opts => {
            const where = opts?.where as { cancelledAt?: unknown }
            if (where.cancelledAt !== undefined && where.cancelledAt !== null) {
                return [
                    {
                        id: 'cancelled-visible',
                        date: '2026-04-22',
                        companyId: 'company-uuid',
                        cancelledAt: new Date('2026-04-18T12:00:00Z'),
                        cancelledReason: 'طقس',
                        stations: [
                            { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                            { cityId: 'homs', order: 1, arrivalTime: '07:30', departureTime: null },
                        ],
                    } as unknown as TripEntity,
                    {
                        id: 'cancelled-dismissed',
                        date: '2026-04-22',
                        companyId: 'company-uuid',
                        cancelledAt: new Date('2026-04-17T12:00:00Z'),
                        cancelledReason: 'عطل',
                        stations: [
                            { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                            { cityId: 'latakia', order: 1, arrivalTime: '09:00', departureTime: null },
                        ],
                    } as unknown as TripEntity,
                ]
            }
            return []
        })
        bookingRepository.find.mockResolvedValue([])
        bookingRepository.createQueryBuilder.mockReturnValue(makeQb([], 0))
        dismissalRepository.find.mockResolvedValue([
            { userId: 'user-uuid', tripId: 'cancelled-dismissed' } as CancelledTripDismissalEntity,
        ])

        const overview = await service.getOverview('user-uuid', 'company-uuid')
        expect(overview.cancelledTrips).toHaveLength(1)
        expect(overview.cancelledTrips[0]!.id).toBe('cancelled-visible')
        expect(overview.cancelledTrips[0]!.cancelledReason).toBe('طقس')
    })
})
