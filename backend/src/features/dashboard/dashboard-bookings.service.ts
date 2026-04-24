import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { BookingResponse, segmentsOverlap } from '@ticketshop-sy/shared-models'
import { DataSource, Repository } from 'typeorm'
import { CITY_MAP } from '../../common/data/cities.data'
import { BookingsService } from '../bookings/bookings.service'
import { CreateBookingDto } from '../bookings/dto/create-booking.dto'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { EmailService } from '../mail/email.service'
import { TripEntity } from '../trips/entities/trip.entity'
import { sortStations } from '../trips/trip.mapper'
import { UpdateBookingDto } from './dto/update-booking.dto'

export interface DashboardCreateBookingResult {
    booking: BookingResponse
    warning: string | null
}

export type BookingStatusFilter = 'all' | 'past' | 'ongoing' | 'cancelled'

export interface SearchBookingsOptions {
    query?: string
    date?: string
    status?: BookingStatusFilter
    page?: number
}

export interface DashboardBookingListItem {
    id: string
    reference: string
    passengerName: string
    passengerPhone: string
    passengerEmail: string | null
    seatIds: number[]
    boardingStationId: string
    boardingCity: string
    dropoffStationId: string
    dropoffCity: string
    tripDate: string
    totalPrice: number
    paymentMethod: string
    status: string
    createdAt: string
    tripCancelled: boolean
}

export interface BookingsSearchResult {
    bookings: DashboardBookingListItem[]
    total: number
    page: number
    pageSize: number
}

const BOOKING_PAGE_SIZE = 20

@Injectable()
export class DashboardBookingsService {
    constructor(
        private readonly bookingsService: BookingsService,
        private readonly emailService: EmailService,
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>,
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {}

    async create(companyId: string, dto: CreateBookingDto): Promise<DashboardCreateBookingResult> {
        const trip = await this.tripRepository.findOne({ where: { id: dto.tripId } })
        if (!trip) {
            throw new BadRequestException(`Trip ${dto.tripId} not found`)
        }
        if (trip.companyId !== companyId) {
            throw new ForbiddenException('Cannot create a booking for a trip from another company')
        }

        const { booking, warning } = await this.bookingsService.createBookingInternal(dto, {
            enforceGender: false,
        })
        return { booking, warning }
    }

    async search(companyId: string, opts: SearchBookingsOptions): Promise<BookingsSearchResult> {
        const page = Math.max(1, opts.page ?? 1)

        const qb = this.bookingRepository
            .createQueryBuilder('booking')
            .innerJoin(TripEntity, 'trip', 'trip.id = booking.tripId')
            .where('trip.companyId = :companyId', { companyId })

        if (opts.query) {
            const like = `%${opts.query.trim()}%`
            qb.andWhere(
                '(booking.reference ILIKE :like OR booking.passengerName ILIKE :like OR booking.passengerPhone ILIKE :like)',
                { like }
            )
        }

        if (opts.date) {
            qb.andWhere('trip.date = :date', { date: opts.date })
        }

        if (opts.status === 'cancelled') {
            qb.andWhere(`booking.status = 'cancelled'`)
        } else if (opts.status === 'ongoing') {
            qb.andWhere(`booking.status = 'confirmed'`).andWhere('trip.date >= CURRENT_DATE')
        } else if (opts.status === 'past') {
            qb.andWhere(`booking.status = 'confirmed'`).andWhere('trip.date < CURRENT_DATE')
        }

        qb.orderBy('booking.createdAt', 'DESC')
            .take(BOOKING_PAGE_SIZE)
            .skip((page - 1) * BOOKING_PAGE_SIZE)

        const [rows, total] = await qb.getManyAndCount()

        if (rows.length === 0) {
            return { bookings: [], total, page, pageSize: BOOKING_PAGE_SIZE }
        }

        const tripIds = Array.from(new Set(rows.map(r => r.tripId)))
        const trips = await this.tripRepository.find({ where: tripIds.map(id => ({ id })) })
        const tripById = new Map(trips.map(t => [t.id, t]))

        const bookings: DashboardBookingListItem[] = rows.map(b => {
            const trip = tripById.get(b.tripId)
            return {
                id: b.id,
                reference: b.reference,
                passengerName: b.passengerName,
                passengerPhone: b.passengerPhone,
                passengerEmail: b.passengerEmail,
                seatIds: b.seatIds,
                boardingStationId: b.boardingStationId,
                boardingCity: CITY_MAP.get(b.boardingStationId)?.nameAr ?? b.boardingStationId,
                dropoffStationId: b.dropoffStationId,
                dropoffCity: CITY_MAP.get(b.dropoffStationId)?.nameAr ?? b.dropoffStationId,
                tripDate: trip?.date ?? b.tripSnapshot.date,
                totalPrice: b.totalPrice,
                paymentMethod: b.paymentMethod,
                status: b.status,
                createdAt: b.createdAt.toISOString(),
                tripCancelled: trip?.cancelledAt != null,
            }
        })

        return { bookings, total, page, pageSize: BOOKING_PAGE_SIZE }
    }

    async findOne(companyId: string, reference: string): Promise<BookingResponse> {
        const booking = await this.loadOwnedBooking(companyId, reference)
        return this.bookingsService.toResponse(booking)
    }

    async update(companyId: string, reference: string, dto: UpdateBookingDto): Promise<BookingResponse> {
        const booking = await this.loadOwnedBooking(companyId, reference)

        if (booking.status === 'cancelled') {
            throw new BadRequestException('الحجز ملغى — قم بإعادة تفعيله أولاً')
        }

        const { passenger } = dto
        if (passenger.name !== undefined) booking.passengerName = passenger.name
        if (passenger.phone !== undefined) booking.passengerPhone = passenger.phone
        if (passenger.email !== undefined) booking.passengerEmail = passenger.email ?? null

        await this.bookingRepository.save(booking)
        return this.bookingsService.toResponse(booking)
    }

    async cancel(companyId: string, reference: string): Promise<BookingResponse> {
        const booking = await this.loadOwnedBooking(companyId, reference)

        if (booking.status === 'cancelled') {
            throw new BadRequestException('الحجز ملغى بالفعل')
        }
        if (booking.trip?.cancelledAt) {
            throw new BadRequestException('لا يمكن إلغاء حجز على رحلة ملغاة')
        }

        booking.status = 'cancelled'
        await this.bookingRepository.save(booking)
        return this.bookingsService.toResponse(booking)
    }

    async reactivate(companyId: string, reference: string): Promise<BookingResponse> {
        const booking = await this.loadOwnedBooking(companyId, reference)

        if (booking.status !== 'cancelled') {
            throw new BadRequestException('الحجز ليس ملغياً')
        }
        if (booking.trip?.cancelledAt) {
            throw new BadRequestException('لا يمكن إعادة تفعيل حجز على رحلة ملغاة')
        }

        // Serialize with concurrent booking creates on the same trip via FOR UPDATE —
        // ensures the seat-conflict check sees a consistent snapshot.
        return this.dataSource.transaction(async manager => {
            const trip = await manager.findOne(TripEntity, {
                where: { id: booking.tripId },
                relations: { stations: true },
                lock: { mode: 'pessimistic_write' },
            })
            if (!trip) throw new NotFoundException('Trip not found')

            const sorted = sortStations(trip.stations ?? [])
            const myBoarding = sorted.find(s => s.cityId === booking.boardingStationId)
            const myDropoff = sorted.find(s => s.cityId === booking.dropoffStationId)

            const others = await manager.find(BookingEntity, {
                where: { tripId: booking.tripId, status: 'confirmed' },
            })
            const occupied = new Set<number>()
            for (const other of others) {
                if (other.id === booking.id) continue
                if (myBoarding && myDropoff) {
                    const otherBoarding = sorted.find(s => s.cityId === other.boardingStationId)
                    const otherDropoff = sorted.find(s => s.cityId === other.dropoffStationId)
                    if (otherBoarding && otherDropoff) {
                        if (!segmentsOverlap(otherBoarding.order, otherDropoff.order, myBoarding.order, myDropoff.order)) continue
                    }
                }
                for (const seatId of other.seatIds) occupied.add(seatId)
            }
            const conflicts = booking.seatIds.filter(id => occupied.has(id))
            if (conflicts.length > 0) {
                throw new ConflictException(`المقاعد [${conflicts.join('، ')}] قد حُجزت من قِبل آخرين — لا يمكن إعادة التفعيل`)
            }

            booking.status = 'confirmed'
            await manager.save(BookingEntity, booking)
            return this.bookingsService.toResponse(booking)
        })
    }

    async emailTicket(companyId: string, reference: string): Promise<void> {
        const booking = await this.bookingsService.findEntityByReference(reference)

        if (booking.trip.companyId !== companyId) {
            throw new ForbiddenException('Cannot email a ticket for another company’s booking')
        }
        if (!booking.passengerEmail) {
            throw new BadRequestException('Booking has no passenger email')
        }

        const response = this.bookingsService.toResponse(booking)
        const body = this.renderTicketBody(response)

        await this.emailService.send({
            to: booking.passengerEmail,
            subject: `تذكرة رحلتك ${response.reference}`,
            body,
        })
    }

    private async loadOwnedBooking(companyId: string, reference: string): Promise<BookingEntity> {
        const booking = await this.bookingRepository.findOne({
            where: { reference },
            relations: { trip: true },
        })
        if (!booking) {
            throw new NotFoundException(`Booking with reference ${reference} not found`)
        }
        if (booking.trip.companyId !== companyId) {
            throw new ForbiddenException('Cannot access a booking from another company')
        }
        return booking
    }

    private renderTicketBody(booking: BookingResponse): string {
        const seats = booking.seats.join(', ')
        const price = booking.totalPrice.toLocaleString('ar-SY')
        return [
            `رقم الحجز: ${booking.reference}`,
            `الشركة: ${booking.trip.company.nameAr}`,
            `من: ${booking.trip.from.nameAr} إلى: ${booking.trip.to.nameAr}`,
            `التاريخ: ${booking.trip.date} ${booking.trip.departureTime}`,
            `المقاعد: ${seats}`,
            `الإجمالي: ${price} ل.س`,
        ].join('\n')
    }
}
