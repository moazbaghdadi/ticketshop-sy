import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TripEntity } from './entities/trip.entity'
import { TripsController } from './trips.controller'
import { TripsService } from './trips.service'

@Module({
    imports: [TypeOrmModule.forFeature([TripEntity])],
    controllers: [TripsController],
    providers: [TripsService],
    exports: [TripsService],
})
export class TripsModule {}
