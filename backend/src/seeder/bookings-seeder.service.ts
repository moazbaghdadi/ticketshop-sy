import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SeatGender } from '@ticketshop-sy/shared-models'
import { Repository } from 'typeorm'
import { BookingEntity } from '../features/bookings/entities/booking.entity'
import { TripEntity } from '../features/trips/entities/trip.entity'
import { seededRandom } from './trips-seeder.service'

const OCCUPANCY_RATE = 0.3

interface SeatDetail {
    id: number
    row: number
    col: number
    gender: SeatGender
}

@Injectable()
export class BookingsSeederService {
    private readonly logger = new Logger(BookingsSeederService.name)

    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>
    ) {}

    async seed(): Promise<number> {
        const trips = await this.tripRepository.find({ relations: { company: true } })
        this.logger.log(`Generating mock bookings for ${trips.length} trips...`)

        let totalBookings = 0
        const batchSize = 500
        let batch: Partial<BookingEntity>[] = []

        for (const trip of trips) {
            const seed = trip.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
            const rand = seededRandom(seed)

            // Generate occupied seats with gender pairing
            const occupiedSeats: SeatDetail[] = []
            let seatId = 1
            for (let row = 0; row < 10; row++) {
                const leftGender: SeatGender = rand() < 0.5 ? 'male' : 'female'
                const rightGender: SeatGender = rand() < 0.5 ? 'male' : 'female'

                for (let col = 0; col < 4; col++) {
                    const isOccupied = rand() < OCCUPANCY_RATE
                    if (isOccupied) {
                        occupiedSeats.push({
                            id: seatId,
                            row,
                            col,
                            gender: col < 2 ? leftGender : rightGender,
                        })
                    }
                    seatId++
                }
            }

            if (occupiedSeats.length === 0) continue

            // Create a single mock booking per trip with all occupied seats
            const mockRef = `MOCK-${trip.id.replace(/-/g, '').substring(0, 12).toUpperCase()}`
            batch.push({
                reference: mockRef,
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
                seatIds: occupiedSeats.map(s => s.id),
                seatDetails: occupiedSeats,
                paymentMethod: 'sham-cash',
                totalPrice: trip.price * occupiedSeats.length,
                status: 'mock',
            })
            totalBookings++

            if (batch.length >= batchSize) {
                await this.bookingRepository.save(batch)
                batch = []
            }
        }

        if (batch.length > 0) {
            await this.bookingRepository.save(batch)
        }

        return totalBookings
    }
}
