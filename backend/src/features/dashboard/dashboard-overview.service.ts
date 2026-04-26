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

export interface SalesDayPoint {
    date: string
    revenue: number
    bookings: number
}

export interface TopRouteSummary {
    fromCityId: string
    fromCity: string
    toCityId: string
    toCity: string
    revenue: number
    bookings: number
}

export interface DashboardOverview {
    upcomingTrips: UpcomingTripSummary[]
    latestSales: LatestSaleSummary[]
    balance: number
    cancelledTrips: CancelledTripSummary[]
    salesLast30Days: SalesDayPoint[]
    topRoutes: TopRouteSummary[]
}

const UPCOMING_LIMIT = 5
const SALES_LIMIT = 10
const CANCELLATION_WINDOW_DAYS = 30
const CHART_WINDOW_DAYS = 30
const TOP_ROUTES_LIMIT = 5

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
        const windowStartDate = new Date()
        windowStartDate.setDate(windowStartDate.getDate() - (CHART_WINDOW_DAYS - 1))
        const windowStart = windowStartDate.toISOString().slice(0, 10)

        const [upcoming, latestSales, balance, cancelled, salesLast30Days, topRoutes] = await Promise.all([
            this.loadUpcoming(companyId, today),
            this.loadLatestSales(companyId),
            this.loadBalance(companyId),
            this.loadCancelled(userId, companyId),
            this.loadSalesLast30Days(companyId, windowStart, today),
            this.loadTopRoutes(companyId, windowStart, today),
        ])

        return {
            upcomingTrips: upcoming,
            latestSales,
            balance,
            cancelledTrips: cancelled,
            salesLast30Days,
            topRoutes,
        }
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

    private async loadSalesLast30Days(companyId: string, from: string, to: string): Promise<SalesDayPoint[]> {
        const rows = await this.bookingRepository
            .createQueryBuilder('booking')
            .innerJoin(TripEntity, 'trip', 'trip.id = booking.tripId')
            .where('trip.companyId = :companyId', { companyId })
            .andWhere('booking.status = :status', { status: 'confirmed' })
            .andWhere('trip.date >= :from', { from })
            .andWhere('trip.date <= :to', { to })
            // Cast to text so we get a YYYY-MM-DD string and not a pg-parsed JS Date —
            // the latter is interpreted in the system timezone and rolls the day backward
            // when the backend isn't running in UTC, putting bookings into the wrong bin.
            .select(`TO_CHAR(trip.date, 'YYYY-MM-DD')`, 'date')
            .addSelect('COALESCE(SUM(booking.totalPrice), 0)', 'revenue')
            .addSelect('COUNT(booking.id)', 'bookings')
            .groupBy('trip.date')
            .getRawMany<{ date: string; revenue: string; bookings: string }>()

        const byDate = new Map<string, { revenue: number; bookings: number }>()
        for (const r of rows) {
            byDate.set(r.date, { revenue: Number(r.revenue), bookings: Number(r.bookings) })
        }

        const out: SalesDayPoint[] = []
        const cursor = new Date(from)
        const end = new Date(to)
        while (cursor <= end) {
            const key = cursor.toISOString().slice(0, 10)
            const agg = byDate.get(key) ?? { revenue: 0, bookings: 0 }
            out.push({ date: key, revenue: agg.revenue, bookings: agg.bookings })
            cursor.setDate(cursor.getDate() + 1)
        }
        return out
    }

    private async loadTopRoutes(companyId: string, from: string, to: string): Promise<TopRouteSummary[]> {
        const rows = await this.bookingRepository
            .createQueryBuilder('booking')
            .innerJoin(TripEntity, 'trip', 'trip.id = booking.tripId')
            .where('trip.companyId = :companyId', { companyId })
            .andWhere('booking.status = :status', { status: 'confirmed' })
            .andWhere('trip.date >= :from', { from })
            .andWhere('trip.date <= :to', { to })
            .select('booking.boardingStationId', 'fromCityId')
            .addSelect('booking.dropoffStationId', 'toCityId')
            .addSelect('COALESCE(SUM(booking.totalPrice), 0)', 'revenue')
            .addSelect('COUNT(booking.id)', 'bookings')
            .groupBy('booking.boardingStationId')
            .addGroupBy('booking.dropoffStationId')
            .orderBy('revenue', 'DESC')
            .limit(TOP_ROUTES_LIMIT)
            .getRawMany<{ fromCityId: string; toCityId: string; revenue: string; bookings: string }>()

        return rows.map(r => ({
            fromCityId: r.fromCityId,
            fromCity: CITY_MAP.get(r.fromCityId)?.nameAr ?? r.fromCityId,
            toCityId: r.toCityId,
            toCity: CITY_MAP.get(r.toCityId)?.nameAr ?? r.toCityId,
            revenue: Number(r.revenue),
            bookings: Number(r.bookings),
        }))
    }
}
