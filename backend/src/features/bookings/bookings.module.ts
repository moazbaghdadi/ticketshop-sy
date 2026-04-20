import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TripEntity } from '../trips/entities/trip.entity'
import { BookingsController } from './bookings.controller'
import { BookingsService } from './bookings.service'
import { BookingEntity } from './entities/booking.entity'

@Module({
    imports: [TypeOrmModule.forFeature([BookingEntity, TripEntity])],
    controllers: [BookingsController],
    providers: [BookingsService],
    exports: [BookingsService],
})
export class BookingsModule {}
