import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { CITIES, CITY_IDS, CITY_MAP } from '../../common/data/cities.data'
import { arabicNormalize } from '../../common/util/arabic-normalize'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { DriversService } from '../drivers/drivers.service'
import { DriverEntity } from '../drivers/entities/driver.entity'
import { CreateDashboardTripDto } from './dto/create-dashboard-trip.dto'
import { CancelledTripDismissalEntity } from './entities/cancelled-trip-dismissal.entity'
import { TripSegmentPriceEntity } from './entities/trip-segment-price.entity'
import { TripStationEntity } from './entities/trip-station.entity'
import { TripEntity } from './entities/trip.entity'
import { parseHm, sortStations } from './trip.mapper'

export interface DashboardTripSummary {
    id: string
    date: string
    fromCity: string
    toCity: string
    departureTime: string | null
    arrivalTime: string | null
    stationsCount: number
    bookingsCount: number
    seatsSold: number
    cancelledAt: string | null
    cancelledReason: string | null
    driver: { id: string; nameAr: string } | null
}

export interface DashboardTripListResult {
    trips: DashboardTripSummary[]
    total: number
    page: number
    pageSize: number
}

export interface DashboardBookingSummary {
    id: string
    reference: string
    passengerName: string
    passengerPhone: string
    passengerEmail: string | null
    seatIds: number[]
    seatDetails: { id: number; gender: 'male' | 'female' }[]
    boardingStationId: string
    boardingCity: string
    dropoffStationId: string
    dropoffCity: string
    totalPrice: number
    paymentMethod: string
    status: string
    createdAt: string
}

export interface DashboardTripDetail {
    id: string
    date: string
    companyId: string
    driver: { id: string; nameAr: string }
    cancelledAt: string | null
    cancelledReason: string | null
    stations: {
        cityId: string
        nameAr: string
        order: number
        arrivalTime: string | null
        departureTime: string | null
    }[]
    bookings: DashboardBookingSummary[]
}

export type TripStatusFilter = 'active' | 'cancelled' | 'all'
export type TripSortField = 'date' | 'route' | 'status'
export type TripSortDir = 'asc' | 'desc'

export interface ListTripsOptions {
    date?: string
    tripId?: string
    route?: string
    departureFrom?: string
    departureTo?: string
    arrivalFrom?: string
    arrivalTo?: string
    status?: TripStatusFilter
    sortBy?: TripSortField
    sortDir?: TripSortDir
    page?: number
}

const TRIP_PAGE_SIZE = 20

@Injectable()
export class DashboardTripsService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>,
        @InjectRepository(CancelledTripDismissalEntity)
        private readonly dismissalRepository: Repository<CancelledTripDismissalEntity>,
        private readonly driversService: DriversService
    ) {}

    async listTrips(companyId: string, opts: ListTripsOptions = {}): Promise<DashboardTripListResult> {
        const page = Math.max(1, opts.page ?? 1)
        const sortDir: 'ASC' | 'DESC' = opts.sortDir === 'asc' ? 'ASC' : 'DESC'
        const sortBy: TripSortField = opts.sortBy ?? 'date'

        const qb = this.tripRepository.createQueryBuilder('trip').where('trip.companyId = :companyId', { companyId })

        if (opts.date) {
            qb.andWhere('trip.date = :date', { date: opts.date })
        }

        if (opts.tripId) {
            qb.andWhere('CAST(trip.id AS text) ILIKE :tripIdLike', { tripIdLike: `%${opts.tripId}%` })
        }

        if (opts.status === 'active') {
            qb.andWhere('trip.cancelledAt IS NULL')
        } else if (opts.status === 'cancelled') {
            qb.andWhere('trip.cancelledAt IS NOT NULL')
        }

        if (opts.route) {
            const normalized = arabicNormalize(opts.route)
            if (normalized) {
                const matchedCityIds = CITIES.filter(c => arabicNormalize(c.nameAr).includes(normalized)).map(c => c.id)
                if (matchedCityIds.length === 0) {
                    return { trips: [], total: 0, page, pageSize: TRIP_PAGE_SIZE }
                }
                qb.andWhere(
                    'EXISTS (SELECT 1 FROM trip_stations ts WHERE ts."tripId" = trip.id AND ts."cityId" IN (:...matchedCityIds))',
                    { matchedCityIds }
                )
            }
        }

        if (opts.departureFrom || opts.departureTo) {
            const conds: string[] = [
                'o."tripId" = trip.id',
                'o."order" = (SELECT MIN("order") FROM trip_stations WHERE "tripId" = trip.id)',
            ]
            const params: Record<string, string> = {}
            if (opts.departureFrom) {
                conds.push('o."departureTime" >= :depFrom')
                params.depFrom = opts.departureFrom
            }
            if (opts.departureTo) {
                conds.push('o."departureTime" <= :depTo')
                params.depTo = opts.departureTo
            }
            qb.andWhere(`EXISTS (SELECT 1 FROM trip_stations o WHERE ${conds.join(' AND ')})`, params)
        }

        if (opts.arrivalFrom || opts.arrivalTo) {
            const conds: string[] = [
                't."tripId" = trip.id',
                't."order" = (SELECT MAX("order") FROM trip_stations WHERE "tripId" = trip.id)',
            ]
            const params: Record<string, string> = {}
            if (opts.arrivalFrom) {
                conds.push('t."arrivalTime" >= :arrFrom')
                params.arrFrom = opts.arrivalFrom
            }
            if (opts.arrivalTo) {
                conds.push('t."arrivalTime" <= :arrTo')
                params.arrTo = opts.arrivalTo
            }
            qb.andWhere(`EXISTS (SELECT 1 FROM trip_stations t WHERE ${conds.join(' AND ')})`, params)
        }

        if (sortBy === 'status') {
            qb.orderBy('CASE WHEN trip.cancelledAt IS NULL THEN 0 ELSE 1 END', sortDir).addOrderBy('trip.date', 'DESC')
        } else {
            // Both 'date' and 'route' order by date at the SQL layer; 'route' is then re-sorted in-memory on the page slice.
            qb.orderBy('trip.date', sortBy === 'route' ? 'DESC' : sortDir)
        }

        qb.take(TRIP_PAGE_SIZE).skip((page - 1) * TRIP_PAGE_SIZE)

        const [trips, total] = await qb.getManyAndCount()
        const tripIds = trips.map(t => t.id)

        if (tripIds.length === 0) {
            return { trips: [], total, page, pageSize: TRIP_PAGE_SIZE }
        }

        const tripsWithStations = await this.tripRepository.find({
            where: { id: In(tripIds) },
            relations: { stations: true, driver: true },
        })
        const tripById = new Map(tripsWithStations.map(t => [t.id, t]))

        const bookings = await this.bookingRepository.find({ where: { tripId: In(tripIds) } })
        const aggByTrip = new Map<string, { bookings: number; seats: number }>()
        for (const b of bookings) {
            if (b.status === 'cancelled') continue
            const agg = aggByTrip.get(b.tripId) ?? { bookings: 0, seats: 0 }
            agg.bookings++
            agg.seats += b.seatIds.length
            aggByTrip.set(b.tripId, agg)
        }

        let summaries: DashboardTripSummary[] = trips.map(t => {
            const full = tripById.get(t.id) ?? t
            const sorted = sortStations(full.stations ?? [])
            const origin = sorted[0]
            const terminus = sorted[sorted.length - 1]
            const agg = aggByTrip.get(t.id) ?? { bookings: 0, seats: 0 }
            return {
                id: t.id,
                date: t.date,
                fromCity: origin ? (CITY_MAP.get(origin.cityId)?.nameAr ?? origin.cityId) : '',
                toCity: terminus ? (CITY_MAP.get(terminus.cityId)?.nameAr ?? terminus.cityId) : '',
                departureTime: origin?.departureTime ?? null,
                arrivalTime: terminus?.arrivalTime ?? null,
                stationsCount: sorted.length,
                bookingsCount: agg.bookings,
                seatsSold: agg.seats,
                cancelledAt: t.cancelledAt ? t.cancelledAt.toISOString() : null,
                cancelledReason: t.cancelledReason ?? null,
                driver: full.driver ? { id: full.driver.id, nameAr: full.driver.nameAr } : null,
            }
        })

        if (sortBy === 'route') {
            // SQL can't order by the computed route label, so we sort the page in memory.
            // Tradeoff: sort is per-page, not global; acceptable for a small pageSize.
            const coll = new Intl.Collator('ar')
            summaries = summaries.sort((a, b) => {
                const key = coll.compare(`${a.fromCity} → ${a.toCity}`, `${b.fromCity} → ${b.toCity}`)
                return sortDir === 'ASC' ? key : -key
            })
        }

        return { trips: summaries, total, page, pageSize: TRIP_PAGE_SIZE }
    }

    async getTripDetail(companyId: string, tripId: string): Promise<DashboardTripDetail> {
        const trip = await this.tripRepository.findOne({
            where: { id: tripId },
            relations: { stations: true, driver: true },
        })
        if (!trip) {
            throw new NotFoundException(`Trip ${tripId} not found`)
        }
        if (trip.companyId !== companyId) {
            throw new ForbiddenException('Cannot view a trip from another company')
        }

        const bookings = await this.bookingRepository.find({
            where: { tripId },
            order: { createdAt: 'DESC' },
        })

        return {
            id: trip.id,
            date: trip.date,
            companyId: trip.companyId,
            driver: { id: trip.driver.id, nameAr: trip.driver.nameAr },
            cancelledAt: trip.cancelledAt ? trip.cancelledAt.toISOString() : null,
            cancelledReason: trip.cancelledReason ?? null,
            stations: sortStations(trip.stations ?? []).map(s => ({
                cityId: s.cityId,
                nameAr: CITY_MAP.get(s.cityId)?.nameAr ?? s.cityId,
                order: s.order,
                arrivalTime: s.arrivalTime,
                departureTime: s.departureTime,
            })),
            bookings: bookings.map(b => ({
                id: b.id,
                reference: b.reference,
                passengerName: b.passengerName,
                passengerPhone: b.passengerPhone,
                passengerEmail: b.passengerEmail,
                seatIds: b.seatIds,
                seatDetails: b.seatDetails.map(d => ({ id: d.id, gender: d.gender })),
                boardingStationId: b.boardingStationId,
                boardingCity: CITY_MAP.get(b.boardingStationId)?.nameAr ?? b.boardingStationId,
                dropoffStationId: b.dropoffStationId,
                dropoffCity: CITY_MAP.get(b.dropoffStationId)?.nameAr ?? b.dropoffStationId,
                totalPrice: b.totalPrice,
                paymentMethod: b.paymentMethod,
                status: b.status,
                createdAt: b.createdAt.toISOString(),
            })),
        }
    }

    async cancel(companyId: string, tripId: string, reason: string): Promise<TripEntity> {
        const trip = await this.tripRepository.findOne({ where: { id: tripId } })
        if (!trip) {
            throw new NotFoundException(`Trip ${tripId} not found`)
        }
        if (trip.companyId !== companyId) {
            throw new ForbiddenException('Cannot cancel a trip that belongs to another company')
        }
        if (trip.cancelledAt) {
            return trip
        }

        trip.cancelledAt = new Date()
        trip.cancelledReason = reason

        await this.tripRepository.save(trip)
        await this.bookingRepository.update({ tripId }, { status: 'cancelled' })

        return trip
    }

    async dismissCancellation(userId: string, companyId: string, tripId: string): Promise<void> {
        const trip = await this.tripRepository.findOne({ where: { id: tripId } })
        if (!trip) {
            throw new NotFoundException(`Trip ${tripId} not found`)
        }
        if (trip.companyId !== companyId) {
            throw new ForbiddenException('Cannot dismiss a trip from another company')
        }

        const existing = await this.dismissalRepository.findOne({ where: { userId, tripId } })
        if (existing) return

        const dismissal = this.dismissalRepository.create({ userId, tripId })
        await this.dismissalRepository.save(dismissal)
    }

    async create(companyId: string, dto: CreateDashboardTripDto): Promise<TripEntity> {
        this.validate(dto)

        const driver = await this.resolveDriver(companyId, dto.driver)

        const trip = this.tripRepository.create({
            companyId,
            driverId: driver.id,
            date: dto.date,
            stations: dto.stations.map(s =>
                Object.assign(new TripStationEntity(), {
                    cityId: s.cityId,
                    order: s.order,
                    arrivalTime: s.arrivalTime ?? null,
                    departureTime: s.departureTime ?? null,
                })
            ),
            segmentPrices: dto.segmentPrices.map(p =>
                Object.assign(new TripSegmentPriceEntity(), {
                    fromCityId: p.fromCityId,
                    toCityId: p.toCityId,
                    price: p.price,
                })
            ),
        })

        return this.tripRepository.save(trip)
    }

    private async resolveDriver(companyId: string, driver: { id?: string; name?: string } | undefined): Promise<DriverEntity> {
        if (!driver || (!driver.id && !driver.name)) {
            throw new BadRequestException('driver: either id or name is required')
        }
        if (driver.id) {
            return this.driversService.resolveActive(companyId, driver.id)
        }
        return this.driversService.findOrCreate(companyId, driver.name!)
    }

    private validate(dto: CreateDashboardTripDto): void {
        const stations = [...dto.stations].sort((a, b) => a.order - b.order)

        for (const s of stations) {
            if (!CITY_IDS.includes(s.cityId)) {
                throw new BadRequestException(`Unknown cityId: ${s.cityId}`)
            }
        }

        const cityIds = new Set<string>()
        for (const s of stations) {
            if (cityIds.has(s.cityId)) {
                throw new BadRequestException(`Duplicate city on route: ${s.cityId}`)
            }
            cityIds.add(s.cityId)
        }

        const orders = new Set<number>()
        for (const s of stations) {
            if (orders.has(s.order)) {
                throw new BadRequestException(`Duplicate station order: ${s.order}`)
            }
            orders.add(s.order)
        }

        // Time rules:
        // - first station: departureTime required
        // - last station: arrivalTime required
        // - intermediates: both required
        // - monotonic: arrival_i <= departure_i <= arrival_{i+1}
        const first = stations[0]!
        const last = stations[stations.length - 1]!
        if (!first.departureTime) {
            throw new BadRequestException('First station must have a departureTime')
        }
        if (!last.arrivalTime) {
            throw new BadRequestException('Last station must have an arrivalTime')
        }
        for (let i = 1; i < stations.length - 1; i++) {
            const s = stations[i]!
            if (!s.arrivalTime || !s.departureTime) {
                throw new BadRequestException(`Intermediate station at order ${s.order} needs both arrival and departure times`)
            }
        }
        for (let i = 0; i < stations.length; i++) {
            const s = stations[i]!
            if (s.arrivalTime && s.departureTime && parseHm(s.departureTime) < parseHm(s.arrivalTime)) {
                throw new BadRequestException(`Station ${s.cityId}: departureTime must be >= arrivalTime`)
            }
            if (i + 1 < stations.length) {
                const next = stations[i + 1]!
                const leave = s.departureTime ?? s.arrivalTime!
                const reach = next.arrivalTime ?? next.departureTime!
                if (parseHm(reach) < parseHm(leave)) {
                    throw new BadRequestException(`Travel from ${s.cityId} to ${next.cityId} has non-monotonic times`)
                }
            }
        }

        // Pair pricing: every (i, j) with i<j must have a positive price.
        const priceMap = new Map<string, number>()
        for (const p of dto.segmentPrices) {
            const key = `${p.fromCityId}|${p.toCityId}`
            if (priceMap.has(key)) {
                throw new BadRequestException(`Duplicate segment price for ${p.fromCityId} → ${p.toCityId}`)
            }
            if (!cityIds.has(p.fromCityId) || !cityIds.has(p.toCityId)) {
                throw new BadRequestException(`Segment price references unknown station: ${p.fromCityId} → ${p.toCityId}`)
            }
            priceMap.set(key, p.price)
        }
        for (let i = 0; i < stations.length; i++) {
            for (let j = i + 1; j < stations.length; j++) {
                const from = stations[i]!.cityId
                const to = stations[j]!.cityId
                const key = `${from}|${to}`
                const price = priceMap.get(key)
                if (price === undefined || price <= 0) {
                    throw new BadRequestException(`Missing or non-positive price for ${from} → ${to}`)
                }
            }
        }
    }
}
