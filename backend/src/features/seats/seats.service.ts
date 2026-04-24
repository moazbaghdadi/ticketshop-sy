import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Seat, SeatGender, segmentsOverlap } from '@ticketshop-sy/shared-models'
import { Repository } from 'typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { sortStations } from '../trips/trip.mapper'

const TOTAL_ROWS = 10
const TOTAL_COLS = 4

export interface GetSeatsOptions {
    boardingStationId?: string
    dropoffStationId?: string
}

@Injectable()
export class SeatsService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>
    ) {}

    async getSeatsForTrip(tripId: string, opts: GetSeatsOptions = {}): Promise<Seat[]> {
        const trip = await this.tripRepository.findOne({
            where: { id: tripId },
            relations: { stations: true },
        })
        if (!trip) {
            throw new NotFoundException(`Trip ${tripId} not found`)
        }

        const sorted = sortStations(trip.stations ?? [])
        const { boardingStationId, dropoffStationId } = opts
        const hasBoardingFilter = boardingStationId !== undefined && boardingStationId !== ''
        const hasDropoffFilter = dropoffStationId !== undefined && dropoffStationId !== ''

        let boardingStation: (typeof sorted)[number] | undefined
        let dropoffStation: (typeof sorted)[number] | undefined
        if (hasBoardingFilter || hasDropoffFilter) {
            if (!hasBoardingFilter || !hasDropoffFilter) {
                throw new BadRequestException('Both boardingStationId and dropoffStationId must be provided together')
            }
            boardingStation = sorted.find(s => s.cityId === boardingStationId)
            dropoffStation = sorted.find(s => s.cityId === dropoffStationId)
            if (!boardingStation || !dropoffStation) {
                throw new BadRequestException('Boarding or dropoff station does not belong to this trip')
            }
            if (boardingStation.order >= dropoffStation.order) {
                throw new BadRequestException('Boarding station must precede the dropoff station')
            }
        }

        const bookings = await this.bookingRepository.find({ where: { tripId, status: 'confirmed' } })

        const occupiedMap = new Map<number, SeatGender>()
        for (const booking of bookings) {
            if (boardingStation && dropoffStation) {
                const existBoarding = sorted.find(s => s.cityId === booking.boardingStationId)
                const existDropoff = sorted.find(s => s.cityId === booking.dropoffStationId)
                if (!existBoarding || !existDropoff) continue
                if (!segmentsOverlap(existBoarding.order, existDropoff.order, boardingStation.order, dropoffStation.order))
                    continue
            }
            for (const detail of booking.seatDetails) {
                occupiedMap.set(detail.id, detail.gender)
            }
        }

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
