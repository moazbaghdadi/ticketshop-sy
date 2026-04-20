import { generateTripsData, seededRandom } from './trips-seeder.service'

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
        const trips = generateTripsData('damascus', 'aleppo', '2026-04-20')
        expect(trips).toHaveLength(7)
    })

    it('should produce deterministic output', () => {
        const trips1 = generateTripsData('damascus', 'aleppo', '2026-04-20')
        const trips2 = generateTripsData('damascus', 'aleppo', '2026-04-20')

        expect(trips1).toEqual(trips2)
    })

    it('should produce different output for different routes', () => {
        const trips1 = generateTripsData('damascus', 'aleppo', '2026-04-20')
        const trips2 = generateTripsData('damascus', 'homs', '2026-04-20')

        expect(trips1[0]!.price).not.toBe(trips2[0]!.price)
    })

    it('should produce different output for different dates', () => {
        const trips1 = generateTripsData('damascus', 'aleppo', '2026-04-20')
        const trips2 = generateTripsData('damascus', 'aleppo', '2026-04-21')

        expect(trips1[0]!.price).not.toBe(trips2[0]!.price)
    })

    it('should have valid trip data structure', () => {
        const trips = generateTripsData('damascus', 'aleppo', '2026-04-20')

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
            expect(trip.company).toBeTruthy()
            expect(trip.duration).toBeTruthy()
        }
    })
})
