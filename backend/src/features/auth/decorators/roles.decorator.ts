import { SetMetadata } from '@nestjs/common'
import { UserRole } from '@ticketshop-sy/shared-models'

export const ROLES_KEY = 'roles'

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles)
