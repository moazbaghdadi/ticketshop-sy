import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { BookingsModule } from './features/bookings/bookings.module'
import { CompaniesModule } from './features/companies/companies.module'
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
                url: config.get<string>('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/postgres'),
                autoLoadEntities: true,
                synchronize: config.get<string>('NODE_ENV', 'development') === 'development',
            }),
        }),
        CompaniesModule,
        TripsModule,
        SeatsModule,
        BookingsModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
