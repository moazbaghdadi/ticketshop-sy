import { generateTripsData, seededRandom } from './trips-seeder.service'

const COMPANY_IDS = [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
]

function pairKey(from: string, to: string): string {
    return `${from}|${to}`
}

describe('seededRandom', () => {
    it('should produce deterministic output for the same seed', () => {
        const rand1 = seededRandom(42)
        const rand2 = seededRandom(42)

        const values1 = Array.from({ length: 10 }, () => rand1())
        const values2 = Array.from({ length: 10 }, () => rand2())

        expect(values1).toEqual(values2)
    })

    it('should produce different output for different seeds', () => {
        const rand1 = seededRandom(42)
        const rand2 = seededRandom(99)

        expect(rand1()).not.toBe(rand2())
    })

    it('should produce values between 0 and 1', () => {
        const rand = seededRandom(42)

        for (let i = 0; i < 100; i++) {
            const val = rand()
            expect(val).toBeGreaterThan(0)
            expect(val).toBeLessThan(1)
        }
    })
})

describe('generateTripsData', () => {
    it('should generate 7 trips per route/date', () => {
        const trips = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)
        expect(trips).toHaveLength(7)
    })

    it('should produce deterministic output', () => {
        const trips1 = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)
        const trips2 = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)

        expect(trips1).toEqual(trips2)
    })

    it('produces different trips for different routes', () => {
        const trips1 = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)
        const trips2 = generateTripsData('damascus', 'homs', '2026-04-20', COMPANY_IDS)

        const priceA = trips1[0]!.segmentPrices[0]!.price
        const priceB = trips2[0]!.segmentPrices[0]!.price
        expect(priceA).not.toBe(priceB)
    })

    it('produces different trips for different dates', () => {
        const trips1 = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)
        const trips2 = generateTripsData('damascus', 'aleppo', '2026-04-21', COMPANY_IDS)

        const priceA = trips1[0]!.segmentPrices[0]!.price
        const priceB = trips2[0]!.segmentPrices[0]!.price
        expect(priceA).not.toBe(priceB)
    })

    it('first station is origin, last is terminus, with monotonic orders', () => {
        const trips = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)

        for (const trip of trips) {
            const sorted = [...trip.stations].sort((a, b) => a.order - b.order)
            expect(sorted[0]!.cityId).toBe('damascus')
            expect(sorted[sorted.length - 1]!.cityId).toBe('aleppo')
            expect(trip.stations.length).toBeGreaterThanOrEqual(2)
            expect(trip.stations.length).toBeLessThanOrEqual(3)
            expect(sorted[0]!.arrivalTime).toBeNull()
            expect(sorted[0]!.departureTime).toMatch(/^\d{2}:\d{2}$/)
            expect(sorted[sorted.length - 1]!.arrivalTime).toMatch(/^\d{2}:\d{2}$/)
            expect(sorted[sorted.length - 1]!.departureTime).toBeNull()
            expect(COMPANY_IDS).toContain(trip.companyId)
        }
    })

    it('generates a price for every (i<j) station pair', () => {
        const trips = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)

        for (const trip of trips) {
            const sorted = [...trip.stations].sort((a, b) => a.order - b.order)
            const priceKeys = new Set(trip.segmentPrices.map(p => pairKey(p.fromCityId, p.toCityId)))

            for (let i = 0; i < sorted.length; i++) {
                for (let j = i + 1; j < sorted.length; j++) {
                    expect(priceKeys.has(pairKey(sorted[i]!.cityId, sorted[j]!.cityId))).toBe(true)
                }
            }
            for (const p of trip.segmentPrices) {
                expect(p.price).toBeGreaterThan(0)
            }
        }
    })

    it('throws when called with an empty company list', () => {
        expect(() => generateTripsData('damascus', 'aleppo', '2026-04-20', [])).toThrow(
            /at least one companyId/i
        )
    })
})
