import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { BookingResponse } from '@ticketshop-sy/shared-models'
import { Repository } from 'typeorm'
import { BookingsService } from '../bookings/bookings.service'
import { CreateBookingDto } from '../bookings/dto/create-booking.dto'
import { EmailService } from '../mail/email.service'
import { TripEntity } from '../trips/entities/trip.entity'

export interface DashboardCreateBookingResult {
    booking: BookingResponse
    warning: string | null
}

@Injectable()
export class DashboardBookingsService {
    constructor(
        private readonly bookingsService: BookingsService,
        private readonly emailService: EmailService,
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>
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
