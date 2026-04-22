import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { EmailService } from '../mail/email.service'
import { TripEntity } from '../trips/entities/trip.entity'
import { DashboardReportsService } from './dashboard-reports.service'

type RawRow = {
    id: string
    tripId: string
    tripDate: string
    totalPrice: string
    seatIds: number[]
    boardingStationId: string
    dropoffStationId: string
}

describe('DashboardReportsService', () => {
    let service: DashboardReportsService
    let bookingRepository: jest.Mocked<Repository<BookingEntity>>
    let emailService: jest.Mocked<EmailService>
    let whereSpy: jest.Mock
    let whereParams: Record<string, unknown>

    const buildQb = (rows: RawRow[]): SelectQueryBuilder<BookingEntity> => {
        whereParams = {}
        whereSpy = jest.fn((_clause: string, params?: Record<string, unknown>) => {
            if (params) Object.assign(whereParams, params)
            return qb
        })
        const qb = {
            innerJoin: jest.fn().mockReturnThis(),
            where: whereSpy,
            andWhere: whereSpy,
            select: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue(rows),
        } as unknown as SelectQueryBuilder<BookingEntity>
        return qb
    }

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardReportsService,
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: {},
                },
                {
                    provide: getRepositoryToken(BookingEntity),
                    useValue: { createQueryBuilder: jest.fn() },
                },
                {
                    provide: EmailService,
                    useValue: { send: jest.fn().mockResolvedValue(undefined) },
                },
            ],
        }).compile()

        service = module.get(DashboardReportsService)
        bookingRepository = module.get(getRepositoryToken(BookingEntity))
        emailService = module.get(EmailService)
    })

    it('aggregates totals, per-day and per-route for a company in the date range', async () => {
        bookingRepository.createQueryBuilder.mockReturnValue(
            buildQb([
                {
                    id: 'b1',
                    tripId: 't1',
                    tripDate: '2026-04-01',
                    totalPrice: '60000',
                    seatIds: [1, 2],
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                },
                {
                    id: 'b2',
                    tripId: 't1',
                    tripDate: '2026-04-01',
                    totalPrice: '30000',
                    seatIds: [5],
                    boardingStationId: 'damascus',
                    dropoffStationId: 'aleppo',
                },
                {
                    id: 'b3',
                    tripId: 't2',
                    tripDate: '2026-04-02',
                    totalPrice: '20000',
                    seatIds: [3],
                    boardingStationId: 'homs',
                    dropoffStationId: 'latakia',
                },
            ]),
        )

        const report = await service.generate('company-uuid', '2026-04-01', '2026-04-07')

        expect(report.totals.bookings).toBe(3)
        expect(report.totals.seats).toBe(4)
        expect(report.totals.revenue).toBe(110000)
        expect(report.totals.trips).toBe(2)
        expect(report.perDay).toHaveLength(2)
        expect(report.perDay[0]).toEqual({ date: '2026-04-01', bookings: 2, seats: 3, revenue: 90000 })
        expect(report.perDay[1]).toEqual({ date: '2026-04-02', bookings: 1, seats: 1, revenue: 20000 })
        expect(report.perRoute).toHaveLength(2)
        expect(report.perRoute[0]!.fromCity).toBe('دمشق')
        expect(report.perRoute[0]!.toCity).toBe('حلب')
        expect(report.perRoute[0]!.revenue).toBe(90000)
    })

    it('passes inclusive bounds and company scoping to the query builder', async () => {
        bookingRepository.createQueryBuilder.mockReturnValue(buildQb([]))

        await service.generate('company-uuid', '2026-04-01', '2026-04-07')

        expect(whereParams).toMatchObject({
            companyId: 'company-uuid',
            status: 'confirmed',
            from: '2026-04-01',
            to: '2026-04-07',
        })
    })

    it('rejects malformed dates', async () => {
        await expect(service.generate('c', 'not-a-date', '2026-04-07')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects inverted ranges', async () => {
        await expect(service.generate('c', '2026-04-10', '2026-04-01')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('returns zero totals for an empty range', async () => {
        bookingRepository.createQueryBuilder.mockReturnValue(buildQb([]))
        const report = await service.generate('c', '2026-04-01', '2026-04-02')
        expect(report.totals).toEqual({ bookings: 0, seats: 0, revenue: 0, trips: 0 })
        expect(report.perDay).toEqual([])
        expect(report.perRoute).toEqual([])
    })

    it('emailReport delegates to EmailService with the recipient and subject', async () => {
        bookingRepository.createQueryBuilder.mockReturnValue(buildQb([]))

        await service.emailReport('company-uuid', '2026-04-01', '2026-04-07', 'agent@example.com')

        expect(emailService.send).toHaveBeenCalledTimes(1)
        const call = emailService.send.mock.calls[0]![0]
        expect(call.to).toBe('agent@example.com')
        expect(call.subject).toContain('2026-04-01')
        expect(call.subject).toContain('2026-04-07')
    })

    it('emailReport rejects empty recipient', async () => {
        await expect(
            service.emailReport('company-uuid', '2026-04-01', '2026-04-07', '   '),
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})
