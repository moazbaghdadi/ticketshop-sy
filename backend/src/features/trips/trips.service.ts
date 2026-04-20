import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Trip } from '@ticketshop-sy/shared-models'
import { Repository } from 'typeorm'
import { CITY_MAP } from '../../common/data/cities.data'
import { TripEntity } from './entities/trip.entity'

@Injectable()
export class TripsService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>
    ) {}

    async searchTrips(fromCityId: string, toCityId: string, date: string): Promise<Trip[]> {
        const entities = await this.tripRepository.find({
            where: { fromCityId, toCityId, date },
            order: { departureTime: 'ASC' },
        })

        return entities.map(entity => this.toTrip(entity))
    }

    async findById(id: string): Promise<TripEntity | null> {
        return this.tripRepository.findOneBy({ id })
    }

    private toTrip(entity: TripEntity): Trip {
        const fromCity = CITY_MAP.get(entity.fromCityId)
        const toCity = CITY_MAP.get(entity.toCityId)

        return {
            id: entity.id,
            from: fromCity ?? { id: entity.fromCityId, nameAr: entity.fromCityId },
            to: toCity ?? { id: entity.toCityId, nameAr: entity.toCityId },
            company: entity.company,
            departureTime: entity.departureTime,
            arrivalTime: entity.arrivalTime,
            duration: entity.duration,
            durationMinutes: entity.durationMinutes,
            stops: entity.stops,
            price: entity.price,
            date: entity.date,
        }
    }
}
