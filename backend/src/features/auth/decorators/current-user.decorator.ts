import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { UserRole } from '@ticketshop-sy/shared-models'

export interface AuthenticatedUser {
    id: string
    email: string
    companyId: string
    role: UserRole
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>()
    return request.user
})
