// Keys whose values are PII or secrets and must never appear in logs verbatim.
// Matched case-insensitively against the exact key name.
const REDACTED_KEYS = new Set(['passenger', 'password', 'secret', 'token', 'authorization', 'jwt', 'apikey'])

const MAX_DEPTH = 4
const MAX_STRING_LEN = 128

/**
 * Produce a structurally-similar shallow copy of `value` suitable for logging.
 * - Sensitive keys (`passenger`, `password`, `token`, …) are replaced with `<redacted>`.
 * - Long strings collapse to `<str len=N>`.
 * - Arrays log the first element + remaining count.
 * - Recursion is capped so a cyclic / huge graph cannot blow up the log line.
 */
export function summarizeForLog(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) return '[…]'
    if (value === null || value === undefined) return value
    if (Array.isArray(value)) {
        if (value.length === 0) return []
        const sample = summarizeForLog(value[0], depth + 1)
        return value.length === 1 ? [sample] : [sample, `…(+${value.length - 1})`]
    }
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (REDACTED_KEYS.has(k.toLowerCase())) {
                out[k] = '<redacted>'
            } else {
                out[k] = summarizeForLog(v, depth + 1)
            }
        }
        return out
    }
    if (typeof value === 'string' && value.length > MAX_STRING_LEN) {
        return `<str len=${value.length}>`
    }
    return value
}
