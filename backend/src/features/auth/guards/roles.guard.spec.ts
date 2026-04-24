import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@ticketshop-sy/shared-models'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { RolesGuard } from './roles.guard'

function buildContext(user: { role: UserRole } | undefined): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ user }),
        }),
        getHandler: () => () => undefined,
        getClass: () => class {},
    } as unknown as ExecutionContext
}

describe('RolesGuard', () => {
    function build(metadata: UserRole[] | undefined): { guard: RolesGuard } {
        const reflector = {
            getAllAndOverride: jest.fn().mockReturnValue(metadata),
        } as unknown as Reflector
        return { guard: new RolesGuard(reflector) }
    }

    it('passes through when no @Roles metadata is present', () => {
        const { guard } = build(undefined)
        expect(guard.canActivate(buildContext({ role: 'sales' }))).toBe(true)
    })

    it('passes through when @Roles metadata is empty', () => {
        const { guard } = build([])
        expect(guard.canActivate(buildContext({ role: 'sales' }))).toBe(true)
    })

    it('allows users whose role matches', () => {
        const { guard } = build(['admin'])
        expect(guard.canActivate(buildContext({ role: 'admin' }))).toBe(true)
    })

    it('forbids users whose role does not match', () => {
        const { guard } = build(['admin'])
        expect(() => guard.canActivate(buildContext({ role: 'sales' }))).toThrow(ForbiddenException)
    })

    it('forbids requests with no authenticated user', () => {
        const { guard } = build(['admin'])
        expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException)
    })

    it('reads metadata via Reflector with handler + class targets', () => {
        const reflector = {
            getAllAndOverride: jest.fn().mockReturnValue(['admin']),
        } as unknown as Reflector
        const guard = new RolesGuard(reflector)
        guard.canActivate(buildContext({ role: 'admin' }))
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array))
    })
})
