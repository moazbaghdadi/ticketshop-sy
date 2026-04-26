/**
 * Pure offset/time math for trip-template ↔ trip conversions.
 * No DB, no DI, no NestJS — easy to unit-test.
 */

const HM_REGEX = /^\d{2}:\d{2}$/

export function parseHm(hm: string): number {
    if (!HM_REGEX.test(hm)) {
        throw new Error(`Invalid HH:mm: ${hm}`)
    }
    const [h, m] = hm.split(':').map(Number) as [number, number]
    return h * 60 + m
}

export function fmtHm(totalMinutes: number): string {
    // Wrap into [0, 24*60) — multi-day trips aren't modeled (trip is keyed by a single date).
    const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
    const h = Math.floor(wrapped / 60)
    const m = wrapped % 60
    return `${pad(h)}:${pad(m)}`
}

function pad(n: number): string {
    return n.toString().padStart(2, '0')
}

export interface TripStationLike {
    cityId: string
    order: number
    arrivalTime: string | null
    departureTime: string | null
}

export interface TemplateStationData {
    cityId: string
    order: number
    arrivalOffsetMin: number
    departureOffsetMin: number
}

export interface InstantiatedStation {
    cityId: string
    order: number
    arrivalTime: string | null
    departureTime: string | null
}

/**
 * Snapshot a trip's stations into template offsets. The first station's departureTime is the
 * reference point — any station's offset is its time minus this reference (in minutes).
 *
 * Throws if the trip's first station has no departureTime (caller should validate first).
 */
export function snapshotTripToTemplate(stations: TripStationLike[]): TemplateStationData[] {
    if (stations.length === 0) {
        throw new Error('Cannot snapshot a trip with no stations')
    }
    const sorted = [...stations].sort((a, b) => a.order - b.order)
    const first = sorted[0]!
    if (!first.departureTime) {
        throw new Error('First station must have a departureTime to compute offsets')
    }
    const ref = parseHm(first.departureTime)

    return sorted.map((s, idx) => {
        const isFirst = idx === 0
        const isLast = idx === sorted.length - 1

        // First station: arrival not used → 0; departure is the reference itself → 0.
        // Intermediate stations: both required.
        // Last station: arrival required; departure not used → mirror arrival to satisfy NOT NULL.
        const arrival = isFirst ? 0 : minutesFromRef(s.arrivalTime, ref, `station ${s.cityId}: arrivalTime`)
        const departure = isLast
            ? arrival
            : isFirst
              ? 0
              : minutesFromRef(s.departureTime, ref, `station ${s.cityId}: departureTime`)

        return {
            cityId: s.cityId,
            order: s.order,
            arrivalOffsetMin: arrival,
            departureOffsetMin: departure,
        }
    })
}

function minutesFromRef(time: string | null, ref: number, ctx: string): number {
    if (!time) {
        throw new Error(`${ctx} is required`)
    }
    const t = parseHm(time)
    let diff = t - ref
    // Same-day wrap: if the trip crosses midnight, the literal HH:mm value is smaller than ref;
    // assume forward direction (trips are forward-in-time monotonic).
    if (diff < 0) diff += 24 * 60
    return diff
}

/**
 * Instantiate template offsets into a concrete trip's HH:mm times, anchored at firstDepartureTime.
 * First station: arrivalTime = null, departureTime = firstDepartureTime.
 * Last station: arrivalTime = firstDepartureTime + lastArrivalOffsetMin, departureTime = null.
 * Intermediate stations: both filled.
 */
export function instantiateTemplate(
    stations: TemplateStationData[],
    firstDepartureTime: string
): InstantiatedStation[] {
    if (stations.length === 0) return []
    const ref = parseHm(firstDepartureTime)
    const sorted = [...stations].sort((a, b) => a.order - b.order)

    return sorted.map((s, idx) => {
        const isFirst = idx === 0
        const isLast = idx === sorted.length - 1
        return {
            cityId: s.cityId,
            order: s.order,
            arrivalTime: isFirst ? null : fmtHm(ref + s.arrivalOffsetMin),
            departureTime: isLast ? null : fmtHm(ref + s.departureOffsetMin),
        }
    })
}
