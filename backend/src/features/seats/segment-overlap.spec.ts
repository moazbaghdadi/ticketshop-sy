import { segmentsOverlap } from '@ticketshop-sy/shared-models'

describe('segmentsOverlap', () => {
    it('returns false for disjoint segments', () => {
        expect(segmentsOverlap(0, 1, 2, 3)).toBe(false)
        expect(segmentsOverlap(2, 3, 0, 1)).toBe(false)
    })

    it('returns false for touching segments (end == start)', () => {
        // A passenger dropping off at station 2 frees the seat for another boarding at 2.
        expect(segmentsOverlap(0, 2, 2, 4)).toBe(false)
        expect(segmentsOverlap(2, 4, 0, 2)).toBe(false)
    })

    it('returns true for nested segments', () => {
        expect(segmentsOverlap(1, 4, 2, 3)).toBe(true)
        expect(segmentsOverlap(2, 3, 1, 4)).toBe(true)
    })

    it('returns true for identical segments', () => {
        expect(segmentsOverlap(1, 3, 1, 3)).toBe(true)
    })

    it('returns true for crossing segments', () => {
        expect(segmentsOverlap(0, 3, 2, 5)).toBe(true)
        expect(segmentsOverlap(2, 5, 0, 3)).toBe(true)
    })
})
