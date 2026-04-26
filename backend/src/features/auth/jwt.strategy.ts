import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { USER_ROLES, UserRole } from '@ticketshop-sy/shared-models'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthService } from './auth.service'
import { AuthenticatedUser } from './decorators/current-user.decorator'

export interface JwtPayload {
    sub: string
    email: string
    companyId: string
    role: UserRole
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
        config: ConfigService,
        private readonly authService: AuthService
    ) {
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

    /**
     * Re-load the user from DB on every request so a stale token (deleted user, or a
     * companyId that no longer exists) gets rejected, and the request always carries
     * the current companyId rather than whatever was signed into the token.
     */
    async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
        const user = await this.authService.getById(payload.sub).catch(() => null)
        if (!user) {
            throw new UnauthorizedException()
        }
        if (!USER_ROLES.includes(user.role)) {
            throw new UnauthorizedException('Unknown role')
        }
        return {
            id: user.id,
            email: user.email,
            companyId: user.companyId,
            role: user.role,
        }
    }
}
