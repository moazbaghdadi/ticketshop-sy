export interface InviteCliArgs {
    email: string
    companyId: string
}

export class InviteCliArgsError extends Error {}

export function parseInviteArgs(argv: string[]): InviteCliArgs {
    const args = new Map<string, string>()
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i]!
        if (!token.startsWith('--')) continue
        const eq = token.indexOf('=')
        if (eq !== -1) {
            args.set(token.slice(2, eq), token.slice(eq + 1))
        } else {
            const next = argv[i + 1]
            if (next === undefined || next.startsWith('--')) {
                throw new InviteCliArgsError(`Missing value for --${token.slice(2)}`)
            }
            args.set(token.slice(2), next)
            i++
        }
    }
    const email = args.get('email')
    const companyId = args.get('companyId')
    if (!email) throw new InviteCliArgsError('Missing required flag: --email')
    if (!companyId) throw new InviteCliArgsError('Missing required flag: --companyId')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new InviteCliArgsError(`Invalid email: ${email}`)
    }
    return { email, companyId }
}

export function buildInvitationUrl(baseUrl: string, token: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '')
    return `${trimmed}/accept-invitation/${token}`
}
