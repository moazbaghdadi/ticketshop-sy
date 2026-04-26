import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DriversModule } from '../drivers/drivers.module'
import { TripEntity } from '../trips/entities/trip.entity'
import { TripTemplateSegmentPriceEntity } from './entities/trip-template-segment-price.entity'
import { TripTemplateStationEntity } from './entities/trip-template-station.entity'
import { TripTemplateEntity } from './entities/trip-template.entity'
import { TripTemplatesController } from './trip-templates.controller'
import { TripTemplatesService } from './trip-templates.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([TripTemplateEntity, TripTemplateStationEntity, TripTemplateSegmentPriceEntity, TripEntity]),
        DriversModule,
    ],
    controllers: [TripTemplatesController],
    providers: [TripTemplatesService],
    exports: [TripTemplatesService],
})
export class TripTemplatesModule {}
