import { Trip } from '@ticketshop-sy/shared-models'
import { CITY_MAP } from '../../common/data/cities.data'
import { TripStationEntity } from './entities/trip-station.entity'
import { TripEntity } from './entities/trip.entity'

function parseHm(hm: string): number {
    const [h, m] = hm.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
}

function pad(n: number): string {
    return n.toString().padStart(2, '0')
}

export function formatDurationArabic(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m} دقيقة`
    if (m === 0) return `${h} ساعات`
    return `${h} ساعات و ${m} دقيقة`
}

export function sortStations(stations: TripStationEntity[]): TripStationEntity[] {
    return [...stations].sort((a, b) => a.order - b.order)
}

export function findSegmentPrice(entity: TripEntity, fromCityId: string, toCityId: string): number | null {
    const seg = entity.segmentPrices?.find(s => s.fromCityId === fromCityId && s.toCityId === toCityId)
    return seg ? seg.price : null
}

/**
 * Build the shared Trip DTO for a specific boarding/dropoff pair.
 * `from` and `to` must refer to stations on the trip with from.order < to.order.
 */
export function toTripForPair(entity: TripEntity, fromCityId: string, toCityId: string): Trip {
    const sorted = sortStations(entity.stations ?? [])
    const fromStation = sorted.find(s => s.cityId === fromCityId)
    const toStation = sorted.find(s => s.cityId === toCityId)
    if (!fromStation || !toStation) {
        throw new Error(`Trip ${entity.id} does not serve ${fromCityId} → ${toCityId}`)
    }
    if (fromStation.order >= toStation.order) {
        throw new Error(`Trip ${entity.id}: ${fromCityId} is not before ${toCityId}`)
    }

    const departureTime = fromStation.departureTime ?? fromStation.arrivalTime ?? '00:00'
    const arrivalTime = toStation.arrivalTime ?? toStation.departureTime ?? '00:00'
    const durationMinutes = Math.max(0, parseHm(arrivalTime) - parseHm(departureTime))
    const stops = sorted.filter(s => s.order > fromStation.order && s.order < toStation.order).length

    const price = findSegmentPrice(entity, fromCityId, toCityId)
    if (price === null) {
        throw new Error(`Trip ${entity.id} has no segment price for ${fromCityId} → ${toCityId}`)
    }

    const fromCity = CITY_MAP.get(fromCityId) ?? { id: fromCityId, nameAr: fromCityId }
    const toCity = CITY_MAP.get(toCityId) ?? { id: toCityId, nameAr: toCityId }

    return {
        id: entity.id,
        from: fromCity,
        to: toCity,
        company: { id: entity.company.id, nameAr: entity.company.nameAr },
        departureTime,
        arrivalTime,
        duration: formatDurationArabic(durationMinutes),
        durationMinutes,
        stops,
        price,
        date: entity.date,
        stations: sorted.map(s => ({
            cityId: s.cityId,
            nameAr: CITY_MAP.get(s.cityId)?.nameAr ?? s.cityId,
            order: s.order,
            arrivalTime: s.arrivalTime,
            departureTime: s.departureTime,
        })),
    }
}

export { pad, parseHm }
