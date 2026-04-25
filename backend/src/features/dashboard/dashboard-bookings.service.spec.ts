import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { BookingResponse } from '@ticketshop-sy/shared-models'
import { DataSource, Repository } from 'typeorm'
import { BookingsService } from '../bookings/bookings.service'
import { CreateBookingDto } from '../bookings/dto/create-booking.dto'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { EmailService } from '../mail/email.service'
import { TripEntity } from '../trips/entities/trip.entity'
import { DashboardBookingsService } from './dashboard-bookings.service'

describe('DashboardBookingsService', () => {
    let service: DashboardBookingsService
    let bookingsService: jest.Mocked<BookingsService>
    let emailService: jest.Mocked<EmailService>
    let tripRepository: jest.Mocked<Repository<TripEntity>>
    let bookingRepository: jest.Mocked<Repository<BookingEntity>>

    const makeDto = (): CreateBookingDto =>
        ({
            tripId: 'trip-1',
            seatSelections: [{ seatId: 1, gender: 'male' }],
            paymentMethod: 'sham-cash',
            boardingStationId: 'damascus',
            dropoffStationId: 'aleppo',
            passenger: { name: 'أحمد', phone: '0999000000' },
        }) as CreateBookingDto

    const makeBookingResponse = (): BookingResponse =>
        ({ reference: 'SY-ABC', totalPrice: 50000, passenger: { name: 'أحمد', phone: '0999000000', email: null } }) as BookingResponse

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardBookingsService,
                {
                    provide: BookingsService,
                    useValue: {
                        createBookingInternal: jest.fn(),
                        findEntityByReference: jest.fn(),
                        toResponse: jest.fn(),
                    },
                },
                {
                    provide: EmailService,
                    useValue: { send: jest.fn().mockResolvedValue(undefined) },
                },
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: { findOne: jest.fn(), find: jest.fn() },
                },
                {
                    provide: getRepositoryToken(BookingEntity),
                    useValue: {
                        createQueryBuilder: jest.fn(),
                        find: jest.fn(),
                        findOne: jest.fn(),
                        save: jest.fn(),
                    },
                },
                {
                    provide: getDataSourceToken(),
                    useValue: { transaction: jest.fn() } as unknown as DataSource,
                },
            ],
        }).compile()

        service = module.get(DashboardBookingsService)
        bookingsService = module.get(BookingsService)
        emailService = module.get(EmailService)
        tripRepository = module.get(getRepositoryToken(TripEntity))
        bookingRepository = module.get(getRepositoryToken(BookingEntity))
    })

    describe('create', () => {
        it('surfaces warning without blocking when gender constraint would be violated', async () => {
            tripRepository.findOne.mockResolvedValue({ id: 'trip-1', companyId: 'company-uuid' } as TripEntity)
            bookingsService.createBookingInternal.mockResolvedValue({
                booking: makeBookingResponse(),
                warning: 'مقعد 1 (ذكر) بجانب مقعد 2 (أنثى)',
                trip: {} as TripEntity,
            })

            const result = await service.create('company-uuid', makeDto())

            expect(result.warning).toContain('مقعد')
            expect(result.booking.reference).toBe('SY-ABC')
            expect(bookingsService.createBookingInternal).toHaveBeenCalledWith(expect.any(Object), { enforceGender: false })
        })

        it('rejects with ForbiddenException when trip belongs to another company', async () => {
            tripRepository.findOne.mockResolvedValue({ id: 'trip-1', companyId: 'other-company' } as TripEntity)

            await expect(service.create('company-uuid', makeDto())).rejects.toBeInstanceOf(ForbiddenException)
            expect(bookingsService.createBookingInternal).not.toHaveBeenCalled()
        })

        it('returns null warning when no gender violation occurs', async () => {
            tripRepository.findOne.mockResolvedValue({ id: 'trip-1', companyId: 'company-uuid' } as TripEntity)
            bookingsService.createBookingInternal.mockResolvedValue({
                booking: makeBookingResponse(),
                warning: null,
                trip: {} as TripEntity,
            })

            const result = await service.create('company-uuid', makeDto())
            expect(result.warning).toBeNull()
        })
    })

    describe('emailTicket', () => {
        it('rejects cross-company email requests', async () => {
            bookingsService.findEntityByReference.mockResolvedValue({
                trip: { companyId: 'other-company' },
                passengerEmail: 'a@b.co',
            } as unknown as BookingEntity)

            await expect(service.emailTicket('company-uuid', 'SY-ABC')).rejects.toBeInstanceOf(ForbiddenException)
            expect(emailService.send).not.toHaveBeenCalled()
        })

        it('rejects when booking has no passenger email', async () => {
            bookingsService.findEntityByReference.mockResolvedValue({
                trip: { companyId: 'company-uuid' },
                passengerEmail: null,
            } as unknown as BookingEntity)

            await expect(service.emailTicket('company-uuid', 'SY-ABC')).rejects.toBeInstanceOf(BadRequestException)
            expect(emailService.send).not.toHaveBeenCalled()
        })

        it('sends the email via EmailService when the booking has an email', async () => {
            bookingsService.findEntityByReference.mockResolvedValue({
                trip: { companyId: 'company-uuid' },
                passengerEmail: 'passenger@example.com',
            } as unknown as BookingEntity)
            bookingsService.toResponse.mockReturnValue({
                reference: 'SY-ABC',
                totalPrice: 50000,
                seats: [1, 2],
                trip: {
                    company: { nameAr: 'الأهلية' },
                    from: { nameAr: 'دمشق' },
                    to: { nameAr: 'حلب' },
                    date: '2026-05-01',
                    departureTime: '06:00',
                },
            } as unknown as BookingResponse)

            await service.emailTicket('company-uuid', 'SY-ABC')

            expect(emailService.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'passenger@example.com',
                    subject: expect.stringContaining('SY-ABC'),
                    body: expect.stringContaining('SY-ABC'),
                })
            )
        })
    })

    describe('exportCsv', () => {
        const makeQueryBuilder = (rows: Partial<BookingEntity>[]) => ({
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue(rows),
        })

        const makeBooking = (overrides: Partial<BookingEntity> = {}): BookingEntity =>
            ({
                id: 'b1',
                reference: 'SY-ABC',
                tripId: 'trip-1',
                passengerName: 'أحمد',
                passengerPhone: '0999000000',
                passengerEmail: null,
                seatIds: [1, 2],
                boardingStationId: 'damascus',
                dropoffStationId: 'aleppo',
                tripSnapshot: { date: '2026-05-01' } as unknown as BookingEntity['tripSnapshot'],
                totalPrice: 50000,
                paymentMethod: 'sham-cash',
                status: 'confirmed',
                createdAt: new Date('2026-04-01T10:00:00Z'),
                ...overrides,
            }) as BookingEntity

        it('produces CSV with Arabic headers and one row per booking', async () => {
            const qb = makeQueryBuilder([makeBooking()])
            ;(bookingRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb)
            tripRepository.find.mockResolvedValue([{ id: 'trip-1', date: '2026-05-01' } as TripEntity])

            const csv = await service.exportCsv('company-uuid', {})

            const lines = csv.split('\r\n')
            expect(lines).toHaveLength(2)
            expect(lines[0]).toContain('رقم الحجز')
            expect(lines[0]).toContain('اسم الراكب')
            expect(lines[1]).toContain('SY-ABC')
            expect(lines[1]).toContain('أحمد')
            expect(lines[1]).toContain('1; 2')
            expect(qb.where).toHaveBeenCalledWith('trip.companyId = :companyId', { companyId: 'company-uuid' })
        })

        it('returns header-only when no bookings match', async () => {
            const qb = makeQueryBuilder([])
            ;(bookingRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb)

            const csv = await service.exportCsv('company-uuid', {})

            expect(csv.split('\r\n')).toHaveLength(1)
            expect(tripRepository.find).not.toHaveBeenCalled()
        })

        it('translates status to Arabic and quotes fields containing CSV delimiters', async () => {
            const qb = makeQueryBuilder([
                makeBooking({ passengerName: 'Smith, John', status: 'cancelled', passengerEmail: 'a@b.co' }),
            ])
            ;(bookingRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb)
            tripRepository.find.mockResolvedValue([{ id: 'trip-1', date: '2026-05-01' } as TripEntity])

            const csv = await service.exportCsv('company-uuid', {})

            const dataRow = csv.split('\r\n')[1]
            expect(dataRow).toContain('"Smith, John"')
            expect(dataRow).toContain('ملغى')
            expect(dataRow).toContain('a@b.co')
        })

        it('applies the cancelled status filter via andWhere', async () => {
            const qb = makeQueryBuilder([])
            ;(bookingRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb)

            await service.exportCsv('company-uuid', { status: 'cancelled' })

            expect(qb.andWhere).toHaveBeenCalledWith(`booking.status = 'cancelled'`)
        })
    })
})
