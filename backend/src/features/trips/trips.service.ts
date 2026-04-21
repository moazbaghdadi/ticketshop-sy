import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Trip } from '@ticketshop-sy/shared-models'
import { Repository } from 'typeorm'
import { TripEntity } from './entities/trip.entity'
import { sortStations, toTripForPair } from './trip.mapper'

@Injectable()
export class TripsService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>
    ) {}

    async searchTrips(fromCityId: string, toCityId: string, date: string): Promise<Trip[]> {
        if (fromCityId === toCityId) return []

        const entities = await this.tripRepository.find({
            where: { date },
            relations: { company: true, stations: true, segmentPrices: true },
        })

        const results: Trip[] = []
        for (const entity of entities) {
            const sorted = sortStations(entity.stations ?? [])
            const fromStation = sorted.find(s => s.cityId === fromCityId)
            const toStation = sorted.find(s => s.cityId === toCityId)
            if (!fromStation || !toStation) continue
            if (fromStation.order >= toStation.order) continue
            try {
                results.push(toTripForPair(entity, fromCityId, toCityId))
            } catch {
                continue
            }
        }

        results.sort((a, b) => a.departureTime.localeCompare(b.departureTime))
        return results
    }

    async findById(id: string): Promise<TripEntity | null> {
        return this.tripRepository.findOne({
            where: { id },
            relations: { company: true, stations: true, segmentPrices: true },
        })
    }
}
