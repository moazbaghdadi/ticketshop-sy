import { buildInvitationUrl, InviteCliArgsError, parseInviteArgs } from './invite.util'

describe('parseInviteArgs', () => {
    it('parses --key=value form', () => {
        expect(parseInviteArgs(['--email=a@b.c', '--companyId=abc-123'])).toEqual({
            email: 'a@b.c',
            companyId: 'abc-123',
        })
    })

    it('parses --key value form', () => {
        expect(parseInviteArgs(['--email', 'a@b.c', '--companyId', 'abc-123'])).toEqual({
            email: 'a@b.c',
            companyId: 'abc-123',
        })
    })

    it('rejects missing --email', () => {
        expect(() => parseInviteArgs(['--companyId=abc'])).toThrow(InviteCliArgsError)
    })

    it('rejects missing --companyId', () => {
        expect(() => parseInviteArgs(['--email=a@b.c'])).toThrow(InviteCliArgsError)
    })

    it('rejects invalid email shape', () => {
        expect(() => parseInviteArgs(['--email=not-an-email', '--companyId=abc'])).toThrow(
            /Invalid email/
        )
    })

    it('rejects --email followed by another flag instead of a value', () => {
        expect(() => parseInviteArgs(['--email', '--companyId=abc'])).toThrow(/Missing value for --email/)
    })
})

describe('buildInvitationUrl', () => {
    it('joins base and token with a single slash', () => {
        expect(buildInvitationUrl('http://localhost:4201', 'abc')).toBe(
            'http://localhost:4201/accept-invitation/abc'
        )
    })

    it('trims trailing slashes on the base URL', () => {
        expect(buildInvitationUrl('http://localhost:4201///', 'abc')).toBe(
            'http://localhost:4201/accept-invitation/abc'
        )
    })
})
