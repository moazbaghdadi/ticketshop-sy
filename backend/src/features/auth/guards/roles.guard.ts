import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@ticketshop-sy/shared-models'
import { AuthenticatedUser } from '../decorators/current-user.decorator'
import { ROLES_KEY } from '../decorators/roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(ctx: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
            ctx.getHandler(),
            ctx.getClass(),
        ])
        if (!required || required.length === 0) {
            return true
        }
        const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
        const user = request.user
        if (!user || !required.includes(user.role)) {
            throw new ForbiddenException('Insufficient role')
        }
        return true
    }
}
