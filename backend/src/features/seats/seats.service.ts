import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Seat, SeatGender } from '@ticketshop-sy/shared-models'
import { Repository } from 'typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { TripEntity } from '../trips/entities/trip.entity'

const TOTAL_ROWS = 10
const TOTAL_COLS = 4

@Injectable()
export class SeatsService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>
    ) {}

    async getSeatsForTrip(tripId: string): Promise<Seat[]> {
        const trip = await this.tripRepository.findOneBy({ id: tripId })
        if (!trip) {
            throw new NotFoundException(`Trip ${tripId} not found`)
        }

        const bookings = await this.bookingRepository.find({ where: { tripId } })

        // Build a map of occupied seats from bookings
        const occupiedMap = new Map<number, SeatGender>()
        for (const booking of bookings) {
            for (const detail of booking.seatDetails) {
                occupiedMap.set(detail.id, detail.gender)
            }
        }

        // Build 40-seat layout
        const seats: Seat[] = []
        let seatId = 1
        for (let row = 0; row < TOTAL_ROWS; row++) {
            for (let col = 0; col < TOTAL_COLS; col++) {
                const gender = occupiedMap.get(seatId)
                seats.push({
                    id: seatId,
                    row,
                    col,
                    status: gender !== undefined ? 'occupied' : 'available',
                    gender,
                })
                seatId++
            }
        }

        return seats
    }
}
