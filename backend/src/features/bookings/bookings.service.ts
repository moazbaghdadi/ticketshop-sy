import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { BookingResponse, SeatGender } from '@ticketshop-sy/shared-models'
import { randomBytes } from 'crypto'
import { Repository } from 'typeorm'
import { CITY_MAP } from '../../common/data/cities.data'
import { TripEntity } from '../trips/entities/trip.entity'
import { CreateBookingDto } from './dto/create-booking.dto'
import { BookingEntity } from './entities/booking.entity'

@Injectable()
export class BookingsService {
    constructor(
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>,
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>
    ) {}

    async createBooking(dto: CreateBookingDto): Promise<BookingResponse> {
        // 1. Verify trip exists
        const trip = await this.tripRepository.findOne({ where: { id: dto.tripId }, relations: { company: true } })
        if (!trip) {
            throw new NotFoundException(`Trip ${dto.tripId} not found`)
        }

        // 2. Get existing bookings to check seat availability
        const existingBookings = await this.bookingRepository.find({ where: { tripId: dto.tripId } })
        const occupiedSeats = new Map<number, SeatGender>()
        for (const booking of existingBookings) {
            for (const detail of booking.seatDetails) {
                occupiedSeats.set(detail.id, detail.gender)
            }
        }

        // 3. Validate requested seats are available
        for (const sel of dto.seatSelections) {
            if (occupiedSeats.has(sel.seatId)) {
                throw new ConflictException(`Seat ${sel.seatId} is already occupied`)
            }
        }

        // 4. Validate gender constraints
        for (const sel of dto.seatSelections) {
            const row = Math.floor((sel.seatId - 1) / 4)
            const col = (sel.seatId - 1) % 4
            const sideCols = col < 2 ? [0, 1] : [2, 3]

            for (const sideCol of sideCols) {
                const neighborId = row * 4 + sideCol + 1
                if (neighborId === sel.seatId) continue

                const neighborGender = occupiedSeats.get(neighborId)
                if (neighborGender !== undefined && neighborGender !== sel.gender) {
                    throw new UnprocessableEntityException(
                        `Gender conflict: seat ${sel.seatId} (${sel.gender}) conflicts with occupied seat ${neighborId} (${neighborGender})`
                    )
                }
            }
        }

        // 5. Generate unique reference
        const reference = await this.generateUniqueReference()

        // 6. Build seat details
        const seatDetails = dto.seatSelections.map(sel => ({
            id: sel.seatId,
            row: Math.floor((sel.seatId - 1) / 4),
            col: (sel.seatId - 1) % 4,
            gender: sel.gender,
        }))

        // 7. Compute total price
        const totalPrice = trip.price * dto.seatSelections.length

        // 8. Persist booking
        const booking = this.bookingRepository.create({
            reference,
            tripId: trip.id,
            tripSnapshot: {
                id: trip.id,
                fromCityId: trip.fromCityId,
                toCityId: trip.toCityId,
                company: { id: trip.company.id, nameAr: trip.company.nameAr },
                departureTime: trip.departureTime,
                arrivalTime: trip.arrivalTime,
                duration: trip.duration,
                durationMinutes: trip.durationMinutes,
                stops: trip.stops,
                price: trip.price,
                date: trip.date,
            },
            seatIds: dto.seatSelections.map(s => s.seatId),
            seatDetails,
            paymentMethod: dto.paymentMethod,
            totalPrice,
            status: 'confirmed',
        })

        const saved = await this.bookingRepository.save(booking)

        return this.toResponse(saved)
    }

    async findByReference(reference: string): Promise<BookingResponse> {
        const booking = await this.bookingRepository.findOne({ where: { reference } })
        if (!booking) {
            throw new NotFoundException(`Booking with reference ${reference} not found`)
        }

        return this.toResponse(booking)
    }

    private toResponse(booking: BookingEntity): BookingResponse {
        const snapshot = booking.tripSnapshot
        const fromCity = CITY_MAP.get(snapshot.fromCityId)
        const toCity = CITY_MAP.get(snapshot.toCityId)

        return {
            id: booking.id,
            reference: booking.reference,
            trip: {
                id: snapshot.id,
                from: fromCity ?? { id: snapshot.fromCityId, nameAr: snapshot.fromCityId },
                to: toCity ?? { id: snapshot.toCityId, nameAr: snapshot.toCityId },
                company: snapshot.company,
                departureTime: snapshot.departureTime,
                arrivalTime: snapshot.arrivalTime,
                duration: snapshot.duration,
                durationMinutes: snapshot.durationMinutes,
                stops: snapshot.stops,
                price: snapshot.price,
                date: snapshot.date,
            },
            seats: booking.seatIds,
            seatDetails: booking.seatDetails.map(d => ({
                id: d.id,
                row: d.row,
                col: d.col,
                gender: d.gender,
            })),
            paymentMethod: booking.paymentMethod as 'sham-cash' | 'syriatel-cash',
            totalPrice: booking.totalPrice,
            status: booking.status,
            createdAt: booking.createdAt.toISOString(),
        }
    }

    private async generateUniqueReference(): Promise<string> {
        for (let attempt = 0; attempt < 10; attempt++) {
            const ref = 'SY-' + randomBytes(3).toString('hex').toUpperCase()
            const existing = await this.bookingRepository.findOne({ where: { reference: ref } })
            if (!existing) return ref
        }
        throw new Error('Failed to generate unique booking reference after 10 attempts')
    }
}
