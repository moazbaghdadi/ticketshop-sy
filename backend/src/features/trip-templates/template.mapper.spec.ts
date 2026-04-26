import { fmtHm, instantiateTemplate, parseHm, snapshotTripToTemplate } from './template.mapper'

describe('template.mapper', () => {
    describe('parseHm / fmtHm', () => {
        it('round-trips HH:mm', () => {
            expect(fmtHm(parseHm('06:00'))).toBe('06:00')
            expect(fmtHm(parseHm('23:59'))).toBe('23:59')
            expect(fmtHm(parseHm('00:00'))).toBe('00:00')
        })

        it('wraps offsets past 24h to the same time-of-day', () => {
            expect(fmtHm(parseHm('22:00') + 600)).toBe('08:00')
        })

        it('wraps negative values', () => {
            expect(fmtHm(-30)).toBe('23:30')
        })

        it('rejects malformed input', () => {
            expect(() => parseHm('boom')).toThrow()
            expect(() => parseHm('25:00')).not.toThrow() // doesn't enforce 0-23, just shape
        })
    })

    describe('snapshotTripToTemplate', () => {
        it('produces zero offsets for the first station', () => {
            const result = snapshotTripToTemplate([
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                { cityId: 'aleppo', order: 1, arrivalTime: '10:00', departureTime: null },
            ])
            expect(result[0]).toEqual({
                cityId: 'damascus',
                order: 0,
                arrivalOffsetMin: 0,
                departureOffsetMin: 0,
            })
        })

        it('measures intermediate stations as minutes since first departure', () => {
            const result = snapshotTripToTemplate([
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                { cityId: 'homs', order: 1, arrivalTime: '07:30', departureTime: '07:40' },
                { cityId: 'aleppo', order: 2, arrivalTime: '09:30', departureTime: null },
            ])
            expect(result[1]).toEqual({
                cityId: 'homs',
                order: 1,
                arrivalOffsetMin: 90,
                departureOffsetMin: 100,
            })
            expect(result[2]).toEqual({
                cityId: 'aleppo',
                order: 2,
                arrivalOffsetMin: 210,
                departureOffsetMin: 210, // last-station departure mirrors arrival
            })
        })

        it('handles overnight wrap (first dep 22:00, last arr 04:00)', () => {
            const result = snapshotTripToTemplate([
                { cityId: 'a', order: 0, arrivalTime: null, departureTime: '22:00' },
                { cityId: 'b', order: 1, arrivalTime: '04:00', departureTime: null },
            ])
            expect(result[1]!.arrivalOffsetMin).toBe(360) // 6h
        })

        it('throws when first station has no departureTime', () => {
            expect(() =>
                snapshotTripToTemplate([
                    { cityId: 'a', order: 0, arrivalTime: null, departureTime: null },
                    { cityId: 'b', order: 1, arrivalTime: '04:00', departureTime: null },
                ])
            ).toThrow(/First station/)
        })

        it('throws when an intermediate station is missing times', () => {
            expect(() =>
                snapshotTripToTemplate([
                    { cityId: 'a', order: 0, arrivalTime: null, departureTime: '06:00' },
                    { cityId: 'b', order: 1, arrivalTime: null, departureTime: '07:00' },
                    { cityId: 'c', order: 2, arrivalTime: '09:00', departureTime: null },
                ])
            ).toThrow()
        })
    })

    describe('instantiateTemplate', () => {
        it('emits null for first arrival and last departure', () => {
            const result = instantiateTemplate(
                [
                    { cityId: 'a', order: 0, arrivalOffsetMin: 0, departureOffsetMin: 0 },
                    { cityId: 'b', order: 1, arrivalOffsetMin: 120, departureOffsetMin: 120 },
                ],
                '07:30'
            )
            expect(result[0]!.arrivalTime).toBeNull()
            expect(result[0]!.departureTime).toBe('07:30')
            expect(result[1]!.arrivalTime).toBe('09:30')
            expect(result[1]!.departureTime).toBeNull()
        })

        it('round-trips snapshot → instantiate at the original first-departure time', () => {
            const trip = [
                { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' },
                { cityId: 'homs', order: 1, arrivalTime: '07:30', departureTime: '07:40' },
                { cityId: 'aleppo', order: 2, arrivalTime: '09:30', departureTime: null },
            ]
            const offsets = snapshotTripToTemplate(trip)
            const reconstructed = instantiateTemplate(offsets, '06:00')

            for (let i = 0; i < trip.length; i++) {
                expect(reconstructed[i]!.cityId).toBe(trip[i]!.cityId)
                expect(reconstructed[i]!.arrivalTime).toBe(trip[i]!.arrivalTime)
                expect(reconstructed[i]!.departureTime).toBe(trip[i]!.departureTime)
            }
        })

        it('shifts every station consistently when instantiated at a different time', () => {
            const offsets = [
                { cityId: 'a', order: 0, arrivalOffsetMin: 0, departureOffsetMin: 0 },
                { cityId: 'b', order: 1, arrivalOffsetMin: 90, departureOffsetMin: 100 },
                { cityId: 'c', order: 2, arrivalOffsetMin: 210, departureOffsetMin: 210 },
            ]
            const a = instantiateTemplate(offsets, '06:00')
            const b = instantiateTemplate(offsets, '14:00')

            // Every station's time should be exactly 8h later in (b) vs (a).
            expect(a[1]!.arrivalTime).toBe('07:30')
            expect(b[1]!.arrivalTime).toBe('15:30')
            expect(a[2]!.arrivalTime).toBe('09:30')
            expect(b[2]!.arrivalTime).toBe('17:30')
        })
    })
})
