import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InvitationEntity } from '../features/auth/entities/invitation.entity'
import { UserEntity } from '../features/auth/entities/user.entity'
import { BookingEntity } from '../features/bookings/entities/booking.entity'
import { CompanyEntity } from '../features/companies/entities/company.entity'
import { DriversService } from '../features/drivers/drivers.service'
import { DriverEntity } from '../features/drivers/entities/driver.entity'
import { TripTemplateSegmentPriceEntity } from '../features/trip-templates/entities/trip-template-segment-price.entity'
import { TripTemplateStationEntity } from '../features/trip-templates/entities/trip-template-station.entity'
import { TripTemplateEntity } from '../features/trip-templates/entities/trip-template.entity'
import { CancelledTripDismissalEntity } from '../features/trips/entities/cancelled-trip-dismissal.entity'
import { TripSegmentPriceEntity } from '../features/trips/entities/trip-segment-price.entity'
import { TripStationEntity } from '../features/trips/entities/trip-station.entity'
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
                entities: [
                    UserEntity,
                    InvitationEntity,
                    CompanyEntity,
                    DriverEntity,
                    TripEntity,
                    TripStationEntity,
                    TripSegmentPriceEntity,
                    TripTemplateEntity,
                    TripTemplateStationEntity,
                    TripTemplateSegmentPriceEntity,
                    CancelledTripDismissalEntity,
                    BookingEntity,
                ],
                synchronize: true,
            }),
        }),
        TypeOrmModule.forFeature([
            CompanyEntity,
            DriverEntity,
            TripEntity,
            TripStationEntity,
            TripSegmentPriceEntity,
            CancelledTripDismissalEntity,
            BookingEntity,
        ]),
    ],
    providers: [SeederService, CompaniesSeederService, DriversService, TripsSeederService, BookingsSeederService],
})
export class SeederModule {}
