import { generateTripsData, seededRandom } from './trips-seeder.service'

const COMPANY_IDS = [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
]

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

    it('should produce different output for different routes', () => {
        const trips1 = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)
        const trips2 = generateTripsData('damascus', 'homs', '2026-04-20', COMPANY_IDS)

        expect(trips1[0]!.price).not.toBe(trips2[0]!.price)
    })

    it('should produce different output for different dates', () => {
        const trips1 = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)
        const trips2 = generateTripsData('damascus', 'aleppo', '2026-04-21', COMPANY_IDS)

        expect(trips1[0]!.price).not.toBe(trips2[0]!.price)
    })

    it('should have valid trip data structure with a companyId from the provided set', () => {
        const trips = generateTripsData('damascus', 'aleppo', '2026-04-20', COMPANY_IDS)

        for (const trip of trips) {
            expect(trip.fromCityId).toBe('damascus')
            expect(trip.toCityId).toBe('aleppo')
            expect(trip.date).toBe('2026-04-20')
            expect(trip.departureTime).toMatch(/^\d{2}:\d{2}$/)
            expect(trip.arrivalTime).toMatch(/^\d{2}:\d{2}$/)
            expect(trip.durationMinutes).toBeGreaterThanOrEqual(60)
            expect(trip.price).toBeGreaterThan(0)
            expect(trip.stops).toBeGreaterThanOrEqual(0)
            expect(trip.stops).toBeLessThanOrEqual(3)
            expect(COMPANY_IDS).toContain(trip.companyId)
            expect(trip.duration).toBeTruthy()
        }
    })

    it('should throw when called with an empty company list', () => {
        expect(() => generateTripsData('damascus', 'aleppo', '2026-04-20', [])).toThrow(
            /at least one companyId/i
        )
    })
})
