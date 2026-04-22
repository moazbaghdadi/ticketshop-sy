import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { CancelledTripDismissalEntity } from '../trips/entities/cancelled-trip-dismissal.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { DashboardOverviewController } from './dashboard-overview.controller'
import { DashboardOverviewService } from './dashboard-overview.service'

@Module({
    imports: [TypeOrmModule.forFeature([TripEntity, BookingEntity, CancelledTripDismissalEntity])],
    controllers: [DashboardOverviewController],
    providers: [DashboardOverviewService],
})
export class DashboardModule {}
