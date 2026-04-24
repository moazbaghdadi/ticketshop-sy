import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { USER_ROLES, UserRole } from '@ticketshop-sy/shared-models'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthenticatedUser } from './decorators/current-user.decorator'

export interface JwtPayload {
    sub: string
    email: string
    companyId: string
    role: UserRole
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(config: ConfigService) {
        const secret = config.get<string>('JWT_SECRET')
        if (!secret) {
            throw new Error('JWT_SECRET is not configured')
        }
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        })
    }

    validate(payload: JwtPayload): AuthenticatedUser {
        if (!USER_ROLES.includes(payload.role)) {
            throw new UnauthorizedException('Unknown role')
        }
        return {
            id: payload.sub,
            email: payload.email,
            companyId: payload.companyId,
            role: payload.role,
        }
    }
}
