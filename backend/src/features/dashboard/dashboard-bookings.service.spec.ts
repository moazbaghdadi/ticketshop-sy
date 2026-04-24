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
})
