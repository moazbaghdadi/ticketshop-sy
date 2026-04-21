import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SeatGender } from '@ticketshop-sy/shared-models'
import { Repository } from 'typeorm'
import { BookingEntity } from '../features/bookings/entities/booking.entity'
import { TripEntity } from '../features/trips/entities/trip.entity'
import { findSegmentPrice, sortStations, toTripForPair } from '../features/trips/trip.mapper'
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
        const trips = await this.tripRepository.find({
            relations: { company: true, stations: true, segmentPrices: true },
        })
        this.logger.log(`Generating mock bookings for ${trips.length} trips...`)

        let totalBookings = 0
        const batchSize = 500
        let batch: Partial<BookingEntity>[] = []

        for (const trip of trips) {
            const sorted = sortStations(trip.stations ?? [])
            if (sorted.length < 2) continue
            const origin = sorted[0]!
            const terminus = sorted[sorted.length - 1]!
            const pairPrice = findSegmentPrice(trip, origin.cityId, terminus.cityId)
            if (pairPrice === null) continue

            const seed = trip.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
            const rand = seededRandom(seed)

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

            const tripDto = toTripForPair(trip, origin.cityId, terminus.cityId)
            const mockRef = `MOCK-${trip.id.replace(/-/g, '').substring(0, 12).toUpperCase()}`
            batch.push({
                reference: mockRef,
                tripId: trip.id,
                tripSnapshot: {
                    id: trip.id,
                    fromCityId: origin.cityId,
                    toCityId: terminus.cityId,
                    company: { id: trip.company.id, nameAr: trip.company.nameAr },
                    departureTime: tripDto.departureTime,
                    arrivalTime: tripDto.arrivalTime,
                    duration: tripDto.duration,
                    durationMinutes: tripDto.durationMinutes,
                    stops: tripDto.stops,
                    price: pairPrice,
                    date: trip.date,
                    stations: sorted.map(s => ({
                        cityId: s.cityId,
                        order: s.order,
                        arrivalTime: s.arrivalTime,
                        departureTime: s.departureTime,
                    })),
                },
                seatIds: occupiedSeats.map(s => s.id),
                seatDetails: occupiedSeats,
                paymentMethod: 'sham-cash',
                totalPrice: pairPrice * occupiedSeats.length,
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
