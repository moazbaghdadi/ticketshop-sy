import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BookingsModule } from '../bookings/bookings.module'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { MailModule } from '../mail/mail.module'
import { CancelledTripDismissalEntity } from '../trips/entities/cancelled-trip-dismissal.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { DashboardBookingsController } from './dashboard-bookings.controller'
import { DashboardBookingsService } from './dashboard-bookings.service'
import { DashboardOverviewController } from './dashboard-overview.controller'
import { DashboardOverviewService } from './dashboard-overview.service'
import { DashboardReportsController } from './dashboard-reports.controller'
import { DashboardReportsService } from './dashboard-reports.service'

@Module({
    imports: [TypeOrmModule.forFeature([TripEntity, BookingEntity, CancelledTripDismissalEntity]), BookingsModule, MailModule],
    controllers: [DashboardOverviewController, DashboardBookingsController, DashboardReportsController],
    providers: [DashboardOverviewService, DashboardBookingsService, DashboardReportsService],
})
export class DashboardModule {}
