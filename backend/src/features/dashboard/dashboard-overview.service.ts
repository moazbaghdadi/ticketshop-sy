import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm'
import { CITY_MAP } from '../../common/data/cities.data'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { CancelledTripDismissalEntity } from '../trips/entities/cancelled-trip-dismissal.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { sortStations } from '../trips/trip.mapper'

export interface UpcomingTripSummary {
    id: string
    date: string
    fromCity: string
    toCity: string
    departureTime: string | null
    companyNameAr: string
    bookingsCount: number
    seatsSold: number
}

export interface LatestSaleSummary {
    reference: string
    totalPrice: number
    passengerName: string
    seatsCount: number
    tripDate: string
    createdAt: string
}

export interface CancelledTripSummary {
    id: string
    date: string
    fromCity: string
    toCity: string
    cancelledAt: string
    cancelledReason: string
}

export interface DashboardOverview {
    upcomingTrips: UpcomingTripSummary[]
    latestSales: LatestSaleSummary[]
    balance: number
    cancelledTrips: CancelledTripSummary[]
}

const UPCOMING_LIMIT = 5
const SALES_LIMIT = 10
const CANCELLATION_WINDOW_DAYS = 30

@Injectable()
export class DashboardOverviewService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>,
        @InjectRepository(CancelledTripDismissalEntity)
        private readonly dismissalRepository: Repository<CancelledTripDismissalEntity>
    ) {}

    async getOverview(userId: string, companyId: string): Promise<DashboardOverview> {
        const today = new Date().toISOString().slice(0, 10)

        const [upcoming, latestSales, balance, cancelled] = await Promise.all([
            this.loadUpcoming(companyId, today),
            this.loadLatestSales(companyId),
            this.loadBalance(companyId),
            this.loadCancelled(userId, companyId),
        ])

        return { upcomingTrips: upcoming, latestSales, balance, cancelledTrips: cancelled }
    }

    private async loadUpcoming(companyId: string, today: string): Promise<UpcomingTripSummary[]> {
        const trips = await this.tripRepository.find({
            where: { companyId, date: MoreThanOrEqual(today), cancelledAt: IsNull() },
            relations: { stations: true, company: true },
            order: { date: 'ASC' },
            take: UPCOMING_LIMIT,
        })

        const tripIds = trips.map(t => t.id)
        const bookings = tripIds.length
            ? await this.bookingRepository.find({
                  where: { tripId: In(tripIds), status: Not('cancelled') },
              })
            : []

        const countByTrip = new Map<string, { bookings: number; seats: number }>()
        for (const b of bookings) {
            const agg = countByTrip.get(b.tripId) ?? { bookings: 0, seats: 0 }
            agg.bookings++
            agg.seats += b.seatIds.length
            countByTrip.set(b.tripId, agg)
        }

        return trips.map(trip => {
            const sorted = sortStations(trip.stations ?? [])
            const origin = sorted[0]
            const terminus = sorted[sorted.length - 1]
            const agg = countByTrip.get(trip.id) ?? { bookings: 0, seats: 0 }
            return {
                id: trip.id,
                date: trip.date,
                fromCity: origin ? (CITY_MAP.get(origin.cityId)?.nameAr ?? origin.cityId) : '',
                toCity: terminus ? (CITY_MAP.get(terminus.cityId)?.nameAr ?? terminus.cityId) : '',
                departureTime: origin?.departureTime ?? null,
                companyNameAr: trip.company?.nameAr ?? '',
                bookingsCount: agg.bookings,
                seatsSold: agg.seats,
            }
        })
    }

    private async loadLatestSales(companyId: string): Promise<LatestSaleSummary[]> {
        const sales = await this.bookingRepository
            .createQueryBuilder('booking')
            .innerJoin(TripEntity, 'trip', 'trip.id = booking.tripId')
            .where('trip.companyId = :companyId', { companyId })
            .andWhere('booking.status = :status', { status: 'confirmed' })
            .orderBy('booking.createdAt', 'DESC')
            .take(SALES_LIMIT)
            .getMany()

        return sales.map(b => ({
            reference: b.reference,
            totalPrice: b.totalPrice,
            passengerName: b.passengerName,
            seatsCount: b.seatIds.length,
            tripDate: b.tripSnapshot.date,
            createdAt: b.createdAt.toISOString(),
        }))
    }

    private async loadBalance(companyId: string): Promise<number> {
        const result = await this.bookingRepository
            .createQueryBuilder('booking')
            .innerJoin(TripEntity, 'trip', 'trip.id = booking.tripId')
            .where('trip.companyId = :companyId', { companyId })
            .andWhere('booking.status = :status', { status: 'confirmed' })
            .select('COALESCE(SUM(booking.totalPrice), 0)', 'sum')
            .getRawOne<{ sum: string }>()

        return result ? Number(result.sum) : 0
    }

    private async loadCancelled(userId: string, companyId: string): Promise<CancelledTripSummary[]> {
        const windowStart = new Date()
        windowStart.setDate(windowStart.getDate() - CANCELLATION_WINDOW_DAYS)

        const trips = await this.tripRepository.find({
            where: {
                companyId,
                cancelledAt: MoreThanOrEqual(windowStart),
            },
            relations: { stations: true },
            order: { cancelledAt: 'DESC' },
        })

        if (trips.length === 0) return []

        const dismissals = await this.dismissalRepository.find({ where: { userId } })
        const dismissedIds = new Set(dismissals.map(d => d.tripId))

        return trips
            .filter(t => !dismissedIds.has(t.id) && t.cancelledAt)
            .map(t => {
                const sorted = sortStations(t.stations ?? [])
                const origin = sorted[0]
                const terminus = sorted[sorted.length - 1]
                return {
                    id: t.id,
                    date: t.date,
                    fromCity: origin ? (CITY_MAP.get(origin.cityId)?.nameAr ?? origin.cityId) : '',
                    toCity: terminus ? (CITY_MAP.get(terminus.cityId)?.nameAr ?? terminus.cityId) : '',
                    cancelledAt: t.cancelledAt!.toISOString(),
                    cancelledReason: t.cancelledReason ?? '',
                }
            })
    }
}
