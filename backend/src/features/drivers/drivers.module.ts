import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TripEntity } from '../trips/entities/trip.entity'
import { DriversController } from './drivers.controller'
import { DriversService } from './drivers.service'
import { DriverEntity } from './entities/driver.entity'

@Module({
    imports: [TypeOrmModule.forFeature([DriverEntity, TripEntity])],
    controllers: [DriversController],
    providers: [DriversService],
    exports: [DriversService],
})
export class DriversModule {}
