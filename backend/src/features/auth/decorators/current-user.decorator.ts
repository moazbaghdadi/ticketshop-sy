import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { UserEntity } from '../entities/user.entity'

export interface AuthenticatedUser {
    id: string
    email: string
    companyId: string
    role: UserEntity['role']
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>()
    return request.user
})
