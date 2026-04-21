import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CompanyEntity } from '../companies/entities/company.entity'
import { TripEntity } from './entities/trip.entity'
import { TripsController } from './trips.controller'
import { TripsService } from './trips.service'

@Module({
    imports: [TypeOrmModule.forFeature([TripEntity, CompanyEntity])],
    controllers: [TripsController],
    providers: [TripsService],
    exports: [TripsService],
})
export class TripsModule {}
