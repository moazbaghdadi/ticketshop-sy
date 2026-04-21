import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { StringValue } from 'ms'
import { CompanyEntity } from '../companies/entities/company.entity'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { InvitationEntity } from './entities/invitation.entity'
import { UserEntity } from './entities/user.entity'
import { JwtStrategy } from './jwt.strategy'

@Module({
    imports: [
        TypeOrmModule.forFeature([UserEntity, InvitationEntity, CompanyEntity]),
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService): JwtModuleOptions => {
                const secret = config.get<string>('JWT_SECRET')
                if (!secret) {
                    throw new Error('JWT_SECRET is not configured')
                }
                const expiresIn = config.get<string>('JWT_EXPIRES_IN', '7d') as StringValue
                return {
                    secret,
                    signOptions: { expiresIn },
                }
            },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy],
    exports: [AuthService],
})
export class AuthModule {}
