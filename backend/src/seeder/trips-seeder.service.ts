import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CITIES } from '../common/data/cities.data'
import { TripEntity } from '../features/trips/entities/trip.entity'

const COMPANIES = ['الأهلية', 'القدموس', 'الزنوبية', 'النورس', 'الأمانة']

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

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m} دقيقة`
    if (m === 0) return `${h} ساعات`
    return `${h} ساعات و ${m} دقيقة`
}

export function seededRandom(seed: number): () => number {
    let s = seed
    return (): number => {
        s = (s * 16807 + 0) % 2147483647
        return s / 2147483647
    }
}

interface GeneratedTrip {
    fromCityId: string
    toCityId: string
    company: string
    departureTime: string
    arrivalTime: string
    duration: string
    durationMinutes: number
    stops: number
    price: number
    date: string
}

export function generateTripsData(fromCityId: string, toCityId: string, date: string): GeneratedTrip[] {
    const seed = (fromCityId + toCityId + date).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rand = seededRandom(seed)

    const baseDuration = 120 + Math.floor(rand() * 180)
    const basePrice = 25000 + Math.floor(rand() * 50000)

    return TRIP_TEMPLATES.map(t => {
        const durationVariance = Math.floor(rand() * 60) - 30
        const durationMinutes = Math.max(60, baseDuration + durationVariance)
        const arrivalMinutes = t.depHour * 60 + t.depMin + durationMinutes
        const arrHour = Math.floor(arrivalMinutes / 60) % 24
        const arrMin = arrivalMinutes % 60
        const priceVariance = Math.floor(rand() * 15000) - 5000
        const stops = Math.floor(rand() * 4)

        return {
            fromCityId,
            toCityId,
            company: COMPANIES[Math.floor(rand() * COMPANIES.length)]!,
            departureTime: `${pad(t.depHour)}:${pad(t.depMin)}`,
            arrivalTime: `${pad(arrHour)}:${pad(arrMin)}`,
            duration: formatDuration(durationMinutes),
            durationMinutes,
            stops,
            price: Math.round((basePrice + priceVariance) / 1000) * 1000,
            date,
        }
    })
}

@Injectable()
export class TripsSeederService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>
    ) {}

    async seed(daysAhead: number = 7): Promise<number> {
        await this.tripRepository.query('TRUNCATE TABLE "trips" CASCADE')

        const today = new Date()
        const allTrips: Partial<TripEntity>[] = []

        for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
            const d = new Date(today)
            d.setDate(d.getDate() + dayOffset)
            const dateStr = d.toISOString().split('T')[0]!

            for (const from of CITIES) {
                for (const to of CITIES) {
                    if (from.id === to.id) continue
                    const trips = generateTripsData(from.id, to.id, dateStr)
                    allTrips.push(...trips)
                }
            }
        }

        // Insert in batches to avoid exceeding postgres parameter limit
        const batchSize = 500
        for (let i = 0; i < allTrips.length; i += batchSize) {
            const batch = allTrips.slice(i, i + batchSize)
            await this.tripRepository.insert(batch)
        }

        return allTrips.length
    }
}
