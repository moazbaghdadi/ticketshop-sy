import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthenticatedUser } from './decorators/current-user.decorator'
import { UserEntity } from './entities/user.entity'

export interface JwtPayload {
    sub: string
    email: string
    companyId: string
    role: UserEntity['role']
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
        return {
            id: payload.sub,
            email: payload.email,
            companyId: payload.companyId,
            role: payload.role,
        }
    }
}
