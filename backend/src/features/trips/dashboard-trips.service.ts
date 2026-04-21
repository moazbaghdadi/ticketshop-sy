import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CITY_IDS } from '../../common/data/cities.data'
import { CreateDashboardTripDto } from './dto/create-dashboard-trip.dto'
import { TripSegmentPriceEntity } from './entities/trip-segment-price.entity'
import { TripStationEntity } from './entities/trip-station.entity'
import { TripEntity } from './entities/trip.entity'
import { parseHm } from './trip.mapper'

@Injectable()
export class DashboardTripsService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>
    ) {}

    async create(companyId: string, dto: CreateDashboardTripDto): Promise<TripEntity> {
        this.validate(dto)

        const trip = this.tripRepository.create({
            companyId,
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
