import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { BookingsModule } from './features/bookings/bookings.module'
import { SeatsModule } from './features/seats/seats.module'
import { TripsModule } from './features/trips/trips.module'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'postgres' as const,
                host: config.get<string>('DB_HOST', 'localhost'),
                port: config.get<number>('DB_PORT', 5432),
                username: config.get<string>('DB_USERNAME', 'postgres'),
                password: config.get<string>('DB_PASSWORD', 'postgres'),
                database: config.get<string>('DB_DATABASE', 'postgres'),
                autoLoadEntities: true,
                synchronize: config.get<string>('NODE_ENV', 'development') === 'development',
            }),
        }),
        TripsModule,
        SeatsModule,
        BookingsModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
