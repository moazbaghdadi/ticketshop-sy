import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { CompanyEntity } from '../companies/entities/company.entity'
import { DriversModule } from '../drivers/drivers.module'
import { DashboardTripsController } from './dashboard-trips.controller'
import { DashboardTripsService } from './dashboard-trips.service'
import { CancelledTripDismissalEntity } from './entities/cancelled-trip-dismissal.entity'
import { TripSegmentPriceEntity } from './entities/trip-segment-price.entity'
import { TripStationEntity } from './entities/trip-station.entity'
import { TripEntity } from './entities/trip.entity'
import { TripsController } from './trips.controller'
import { TripsService } from './trips.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            TripEntity,
            TripStationEntity,
            TripSegmentPriceEntity,
            CancelledTripDismissalEntity,
            CompanyEntity,
            BookingEntity,
        ]),
        DriversModule,
    ],
    controllers: [TripsController, DashboardTripsController],
    providers: [TripsService, DashboardTripsService],
    exports: [TripsService, DashboardTripsService],
})
export class TripsModule {}
