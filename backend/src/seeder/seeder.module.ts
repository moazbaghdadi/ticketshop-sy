import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BookingEntity } from '../features/bookings/entities/booking.entity'
import { CompanyEntity } from '../features/companies/entities/company.entity'
import { TripEntity } from '../features/trips/entities/trip.entity'
import { BookingsSeederService } from './bookings-seeder.service'
import { CompaniesSeederService } from './companies-seeder.service'
import { SeederService } from './seeder.service'
import { TripsSeederService } from './trips-seeder.service'

@Module({
    imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'postgres' as const,
                url: config.get<string>('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/postgres'),
                entities: [CompanyEntity, TripEntity, BookingEntity],
                synchronize: true,
            }),
        }),
        TypeOrmModule.forFeature([CompanyEntity, TripEntity, BookingEntity]),
    ],
    providers: [SeederService, CompaniesSeederService, TripsSeederService, BookingsSeederService],
})
export class SeederModule {}
