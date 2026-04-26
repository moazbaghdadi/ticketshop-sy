import { summarizeForLog } from './log-redact'

describe('summarizeForLog', () => {
    it('redacts sensitive keys but keeps structure for the rest', () => {
        const body = {
            tripId: '92a8678a-2039-420c-9dbf-67aef771ed93',
            seatSelections: [{ seatId: 9, gender: 'female' }],
            paymentMethod: 'sham-cash',
            boardingStationId: 'damascus',
            dropoffStationId: 'homs',
            passenger: { name: 'علا كامل', phone: '0945215415', email: null },
        }

        expect(summarizeForLog(body)).toEqual({
            tripId: '92a8678a-2039-420c-9dbf-67aef771ed93',
            seatSelections: [{ seatId: 9, gender: 'female' }],
            paymentMethod: 'sham-cash',
            boardingStationId: 'damascus',
            dropoffStationId: 'homs',
            passenger: '<redacted>',
        })
    })

    it('matches sensitive keys case-insensitively', () => {
        expect(summarizeForLog({ Authorization: 'Bearer x', APIKey: 'k', other: 1 })).toEqual({
            Authorization: '<redacted>',
            APIKey: '<redacted>',
            other: 1,
        })
    })

    it('summarizes long arrays as [first, …(+N)]', () => {
        expect(summarizeForLog({ ids: [1, 2, 3, 4, 5] })).toEqual({ ids: [1, '…(+4)'] })
    })

    it('collapses long strings to a length tag', () => {
        const long = 'x'.repeat(200)
        expect(summarizeForLog({ blob: long })).toEqual({ blob: '<str len=200>' })
    })

    it('caps recursion depth so deeply nested input cannot run away', () => {
        const deep: Record<string, unknown> = { a: { b: { c: { d: { e: { f: 'deep' } } } } } }
        const result = summarizeForLog(deep) as Record<string, unknown>
        // Drilling 5 levels in (a→b→c→d→e) should land on the cap sentinel, not the leaf.
        expect(JSON.stringify(result)).toContain('[…]')
    })

    it('passes scalars through untouched', () => {
        expect(summarizeForLog(42)).toBe(42)
        expect(summarizeForLog('short')).toBe('short')
        expect(summarizeForLog(null)).toBeNull()
        expect(summarizeForLog(undefined)).toBeUndefined()
        expect(summarizeForLog(true)).toBe(true)
    })
})
