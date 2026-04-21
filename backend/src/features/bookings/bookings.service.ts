import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { BookingResponse, SeatGender } from '@ticketshop-sy/shared-models'
import { randomBytes } from 'crypto'
import { Repository } from 'typeorm'
import { CITY_MAP } from '../../common/data/cities.data'
import { TripEntity } from '../trips/entities/trip.entity'
import { findSegmentPrice, sortStations, toTripForPair } from '../trips/trip.mapper'
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
        const trip = await this.tripRepository.findOne({
            where: { id: dto.tripId },
            relations: { company: true, stations: true, segmentPrices: true },
        })
        if (!trip) {
            throw new NotFoundException(`Trip ${dto.tripId} not found`)
        }

        const sorted = sortStations(trip.stations ?? [])
        const boarding = sorted.find(s => s.cityId === dto.boardingStationId)
        const dropoff = sorted.find(s => s.cityId === dto.dropoffStationId)
        if (!boarding || !dropoff) {
            throw new BadRequestException('Boarding or dropoff station does not belong to this trip')
        }
        if (boarding.order >= dropoff.order) {
            throw new BadRequestException('Boarding station must precede the dropoff station')
        }

        const pairPrice = findSegmentPrice(trip, boarding.cityId, dropoff.cityId)
        if (pairPrice === null) {
            throw new UnprocessableEntityException(`Trip ${trip.id} has no price for ${boarding.cityId} → ${dropoff.cityId}`)
        }

        const existingBookings = await this.bookingRepository.find({ where: { tripId: dto.tripId } })
        const occupiedSeats = new Map<number, SeatGender>()
        for (const booking of existingBookings) {
            for (const detail of booking.seatDetails) {
                occupiedSeats.set(detail.id, detail.gender)
            }
        }

        for (const sel of dto.seatSelections) {
            if (occupiedSeats.has(sel.seatId)) {
                throw new ConflictException(`Seat ${sel.seatId} is already occupied`)
            }
        }

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

        const reference = await this.generateUniqueReference()

        const seatDetails = dto.seatSelections.map(sel => ({
            id: sel.seatId,
            row: Math.floor((sel.seatId - 1) / 4),
            col: (sel.seatId - 1) % 4,
            gender: sel.gender,
        }))

        const tripDto = toTripForPair(trip, boarding.cityId, dropoff.cityId)
        const totalPrice = pairPrice * dto.seatSelections.length

        const booking = this.bookingRepository.create({
            reference,
            tripId: trip.id,
            tripSnapshot: {
                id: trip.id,
                fromCityId: boarding.cityId,
                toCityId: dropoff.cityId,
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
            seatIds: dto.seatSelections.map(s => s.seatId),
            seatDetails,
            paymentMethod: dto.paymentMethod,
            totalPrice,
            status: 'confirmed',
            boardingStationId: boarding.cityId,
            dropoffStationId: dropoff.cityId,
            passengerName: dto.passenger.name,
            passengerPhone: dto.passenger.phone,
            passengerEmail: dto.passenger.email ?? null,
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
                stations: snapshot.stations.map(s => ({
                    cityId: s.cityId,
                    nameAr: CITY_MAP.get(s.cityId)?.nameAr ?? s.cityId,
                    order: s.order,
                    arrivalTime: s.arrivalTime,
                    departureTime: s.departureTime,
                })),
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
            boardingStationId: booking.boardingStationId,
            dropoffStationId: booking.dropoffStationId,
            passenger: {
                name: booking.passengerName,
                phone: booking.passengerPhone,
                email: booking.passengerEmail,
            },
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
