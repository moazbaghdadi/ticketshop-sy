import { USER_ROLES, UserRole } from '@ticketshop-sy/shared-models'

export interface InviteCliArgs {
    email: string
    companyId: string
    role: UserRole
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
    const role = args.get('role')
    if (!email) throw new InviteCliArgsError('Missing required flag: --email')
    if (!companyId) throw new InviteCliArgsError('Missing required flag: --companyId')
    if (!role) throw new InviteCliArgsError('Missing required flag: --role')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new InviteCliArgsError(`Invalid email: ${email}`)
    }
    if (!USER_ROLES.includes(role as UserRole)) {
        throw new InviteCliArgsError(`Invalid role: ${role} (expected one of: ${USER_ROLES.join(', ')})`)
    }
    return { email, companyId, role: role as UserRole }
}

export function buildInvitationUrl(baseUrl: string, token: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '')
    return `${trimmed}/accept-invitation/${token}`
}
