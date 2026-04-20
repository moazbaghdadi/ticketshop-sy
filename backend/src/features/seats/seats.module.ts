import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { SeatsController } from './seats.controller'
import { SeatsService } from './seats.service'

@Module({
    imports: [TypeOrmModule.forFeature([TripEntity, BookingEntity])],
    controllers: [SeatsController],
    providers: [SeatsService],
})
export class SeatsModule {}
