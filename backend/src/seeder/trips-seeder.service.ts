import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CITIES, CITY_IDS } from '../common/data/cities.data'
import { CompanyEntity } from '../features/companies/entities/company.entity'
import { TripSegmentPriceEntity } from '../features/trips/entities/trip-segment-price.entity'
import { TripStationEntity } from '../features/trips/entities/trip-station.entity'
import { TripEntity } from '../features/trips/entities/trip.entity'

const TRIP_TEMPLATES = [
    { depHour: 6, depMin: 0 },
    { depHour: 7, depMin: 30 },
    { depHour: 9, depMin: 0 },
    { depHour: 11, depMin: 15 },
    { depHour: 13, depMin: 0 },
    { depHour: 15, depMin: 30 },
    { depHour: 18, depMin: 0 },
]

function pad(n: number): string {
    return n.toString().padStart(2, '0')
}

function fmtHm(totalMinutes: number): string {
    const h = Math.floor((totalMinutes % (24 * 60)) / 60)
    const m = totalMinutes % 60
    return `${pad(h)}:${pad(m)}`
}

export function seededRandom(seed: number): () => number {
    let s = seed
    return (): number => {
        s = (s * 16807 + 0) % 2147483647
        return s / 2147483647
    }
}

export interface GeneratedStation {
    cityId: string
    order: number
    arrivalTime: string | null
    departureTime: string | null
}

export interface GeneratedSegmentPrice {
    fromCityId: string
    toCityId: string
    price: number
}

export interface GeneratedTrip {
    companyId: string
    date: string
    stations: GeneratedStation[]
    segmentPrices: GeneratedSegmentPrice[]
}

/**
 * Generate one trip per TRIP_TEMPLATES entry for the (from, to, date) tuple.
 * Each trip has:
 *   - 2 or 3 stations: [from, (optional intermediate), to]
 *   - a monotonic schedule
 *   - prices for every (i<j) station pair
 */
export function generateTripsData(fromCityId: string, toCityId: string, date: string, companyIds: string[]): GeneratedTrip[] {
    if (companyIds.length === 0) {
        throw new Error('generateTripsData requires at least one companyId')
    }
    const seed = (fromCityId + toCityId + date).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rand = seededRandom(seed)

    const baseDuration = 120 + Math.floor(rand() * 180)
    const basePrice = 25000 + Math.floor(rand() * 50000)

    return TRIP_TEMPLATES.map(t => {
        const durationVariance = Math.floor(rand() * 60) - 30
        const fullDurationMinutes = Math.max(90, baseDuration + durationVariance)
        const priceVariance = Math.floor(rand() * 15000) - 5000
        const fullPrice = Math.max(5000, Math.round((basePrice + priceVariance) / 1000) * 1000)

        // Pick whether to insert one intermediate station.
        const insertStop = rand() < 0.5
        let intermediateCityId: string | null = null
        if (insertStop) {
            const candidates = CITY_IDS.filter(c => c !== fromCityId && c !== toCityId)
            intermediateCityId = candidates[Math.floor(rand() * candidates.length)] ?? null
        }

        const depStart = t.depHour * 60 + t.depMin
        const arrEnd = depStart + fullDurationMinutes

        const stations: GeneratedStation[] = []
        const segmentPrices: GeneratedSegmentPrice[] = []

        if (intermediateCityId) {
            // Split duration ~50/50 ± jitter; layover 5–15 min.
            const firstLeg = Math.floor(fullDurationMinutes * (0.4 + rand() * 0.2))
            const layover = 5 + Math.floor(rand() * 10)
            const midArrive = depStart + firstLeg
            const midDepart = midArrive + layover
            // Ensure arrEnd stays after midDepart.
            const adjustedArrEnd = Math.max(arrEnd, midDepart + 45)

            stations.push({ cityId: fromCityId, order: 0, arrivalTime: null, departureTime: fmtHm(depStart) })
            stations.push({
                cityId: intermediateCityId,
                order: 1,
                arrivalTime: fmtHm(midArrive),
                departureTime: fmtHm(midDepart),
            })
            stations.push({ cityId: toCityId, order: 2, arrivalTime: fmtHm(adjustedArrEnd), departureTime: null })

            // Price split: from→mid ~ 45% of full, mid→to ~ 55%.
            const firstPrice = Math.max(5000, Math.round((fullPrice * 0.45) / 1000) * 1000)
            const secondPrice = Math.max(5000, Math.round((fullPrice * 0.55) / 1000) * 1000)
            segmentPrices.push({ fromCityId, toCityId: intermediateCityId, price: firstPrice })
            segmentPrices.push({ fromCityId: intermediateCityId, toCityId, price: secondPrice })
            segmentPrices.push({ fromCityId, toCityId, price: fullPrice })
        } else {
            stations.push({ cityId: fromCityId, order: 0, arrivalTime: null, departureTime: fmtHm(depStart) })
            stations.push({ cityId: toCityId, order: 1, arrivalTime: fmtHm(arrEnd), departureTime: null })
            segmentPrices.push({ fromCityId, toCityId, price: fullPrice })
        }

        return {
            companyId: companyIds[Math.floor(rand() * companyIds.length)]!,
            date,
            stations,
            segmentPrices,
        }
    })
}

@Injectable()
export class TripsSeederService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>
    ) {}

    async seed(companies: CompanyEntity[], daysAhead: number = 7): Promise<number> {
        if (companies.length === 0) {
            throw new Error('TripsSeederService.seed requires at least one company')
        }
        await this.tripRepository.query('TRUNCATE TABLE "trips" CASCADE')

        const companyIds = companies.map(c => c.id)
        const today = new Date()
        let total = 0

        for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
            const d = new Date(today)
            d.setDate(d.getDate() + dayOffset)
            const dateStr = d.toISOString().split('T')[0]!

            const batch: TripEntity[] = []
            for (const from of CITIES) {
                for (const to of CITIES) {
                    if (from.id === to.id) continue
                    const generated = generateTripsData(from.id, to.id, dateStr, companyIds)
                    for (const g of generated) {
                        const trip = this.tripRepository.create({
                            companyId: g.companyId,
                            date: g.date,
                            stations: g.stations.map(s =>
                                Object.assign(new TripStationEntity(), {
                                    cityId: s.cityId,
                                    order: s.order,
                                    arrivalTime: s.arrivalTime,
                                    departureTime: s.departureTime,
                                })
                            ),
                            segmentPrices: g.segmentPrices.map(p =>
                                Object.assign(new TripSegmentPriceEntity(), {
                                    fromCityId: p.fromCityId,
                                    toCityId: p.toCityId,
                                    price: p.price,
                                })
                            ),
                        })
                        batch.push(trip)
                    }
                }
            }

            // Save in smaller chunks to limit transaction size.
            const chunkSize = 100
            for (let i = 0; i < batch.length; i += chunkSize) {
                await this.tripRepository.save(batch.slice(i, i + chunkSize))
            }
            total += batch.length
        }

        return total
    }
}
