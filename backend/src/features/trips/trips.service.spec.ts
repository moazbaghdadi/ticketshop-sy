import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CompanyEntity } from '../companies/entities/company.entity'
import { TripEntity } from './entities/trip.entity'
import { TripSegmentPriceEntity } from './entities/trip-segment-price.entity'
import { TripStationEntity } from './entities/trip-station.entity'
import { TripsService } from './trips.service'

const mockCompany: CompanyEntity = {
    id: 'company-uuid',
    nameAr: 'الأهلية',
    createdAt: new Date('2026-01-01T00:00:00Z'),
}

function station(overrides: Partial<TripStationEntity>): TripStationEntity {
    return Object.assign(new TripStationEntity(), {
        id: `station-${overrides.cityId}`,
        tripId: 'trip-uuid',
        trip: null as unknown as TripEntity,
        cityId: 'damascus',
        order: 0,
        arrivalTime: null,
        departureTime: null,
        ...overrides,
    })
}

function segment(overrides: Partial<TripSegmentPriceEntity>): TripSegmentPriceEntity {
    return Object.assign(new TripSegmentPriceEntity(), {
        id: 'seg',
        tripId: 'trip-uuid',
        trip: null as unknown as TripEntity,
        fromCityId: 'damascus',
        toCityId: 'aleppo',
        price: 45000,
        ...overrides,
    })
}

function buildTrip(
    id: string,
    date: string,
    stations: TripStationEntity[],
    prices: TripSegmentPriceEntity[]
): TripEntity {
    const trip = new TripEntity()
    trip.id = id
    trip.companyId = mockCompany.id
    trip.company = mockCompany
    trip.date = date
    trip.stations = stations
    trip.segmentPrices = prices
    return trip
}

describe('TripsService', () => {
    let service: TripsService
    let repository: jest.Mocked<Repository<TripEntity>>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TripsService,
                {
                    provide: getRepositoryToken(TripEntity),
                    useValue: {
                        find: jest.fn(),
                        findOne: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = module.get<TripsService>(TripsService)
        repository = module.get(getRepositoryToken(TripEntity))
    })

    it('returns trips whose stations include the searched pair in order', async () => {
        const trip = buildTrip(
            'trip-1',
            '2026-04-20',
            [
                station({ cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' }),
                station({ cityId: 'homs', order: 1, arrivalTime: '07:30', departureTime: '07:40' }),
                station({ cityId: 'aleppo', order: 2, arrivalTime: '09:30', departureTime: null }),
            ],
            [
                segment({ fromCityId: 'damascus', toCityId: 'homs', price: 20000 }),
                segment({ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 }),
                segment({ fromCityId: 'homs', toCityId: 'aleppo', price: 28000 }),
            ]
        )
        repository.find.mockResolvedValue([trip])

        const result = await service.searchTrips('damascus', 'aleppo', '2026-04-20')

        expect(result).toHaveLength(1)
        expect(result[0]!.from).toEqual({ id: 'damascus', nameAr: 'دمشق' })
        expect(result[0]!.to).toEqual({ id: 'aleppo', nameAr: 'حلب' })
        expect(result[0]!.departureTime).toBe('06:00')
        expect(result[0]!.arrivalTime).toBe('09:30')
        expect(result[0]!.price).toBe(45000)
        expect(result[0]!.stops).toBe(1)
        expect(result[0]!.stations).toHaveLength(3)
    })

    it('resolves the pair price for an intermediate segment', async () => {
        const trip = buildTrip(
            'trip-2',
            '2026-04-20',
            [
                station({ cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' }),
                station({ cityId: 'homs', order: 1, arrivalTime: '07:30', departureTime: '07:40' }),
                station({ cityId: 'aleppo', order: 2, arrivalTime: '09:30', departureTime: null }),
            ],
            [
                segment({ fromCityId: 'damascus', toCityId: 'homs', price: 20000 }),
                segment({ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 }),
                segment({ fromCityId: 'homs', toCityId: 'aleppo', price: 28000 }),
            ]
        )
        repository.find.mockResolvedValue([trip])

        const result = await service.searchTrips('homs', 'aleppo', '2026-04-20')

        expect(result).toHaveLength(1)
        expect(result[0]!.price).toBe(28000)
        expect(result[0]!.stops).toBe(0)
        expect(result[0]!.departureTime).toBe('07:40')
        expect(result[0]!.arrivalTime).toBe('09:30')
    })

    it('excludes trips where the pair is out of order', async () => {
        const trip = buildTrip(
            'trip-3',
            '2026-04-20',
            [
                station({ cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' }),
                station({ cityId: 'aleppo', order: 1, arrivalTime: '09:30', departureTime: null }),
            ],
            [segment({ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 })]
        )
        repository.find.mockResolvedValue([trip])

        const result = await service.searchTrips('aleppo', 'damascus', '2026-04-20')

        expect(result).toHaveLength(0)
    })

    it('returns [] when from equals to', async () => {
        const result = await service.searchTrips('damascus', 'damascus', '2026-04-20')
        expect(result).toHaveLength(0)
        expect(repository.find).not.toHaveBeenCalled()
    })

    it('sorts results by departureTime ascending', async () => {
        const later = buildTrip(
            'late',
            '2026-04-20',
            [
                station({ cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '18:00' }),
                station({ cityId: 'aleppo', order: 1, arrivalTime: '21:30', departureTime: null }),
            ],
            [segment({ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 })]
        )
        const earlier = buildTrip(
            'early',
            '2026-04-20',
            [
                station({ cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' }),
                station({ cityId: 'aleppo', order: 1, arrivalTime: '09:30', departureTime: null }),
            ],
            [segment({ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 })]
        )
        repository.find.mockResolvedValue([later, earlier])

        const result = await service.searchTrips('damascus', 'aleppo', '2026-04-20')

        expect(result.map(r => r.id)).toEqual(['early', 'late'])
    })

    it('findById loads stations and segment prices', async () => {
        const trip = buildTrip(
            'trip-x',
            '2026-04-20',
            [
                station({ cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '06:00' }),
                station({ cityId: 'aleppo', order: 1, arrivalTime: '09:30', departureTime: null }),
            ],
            [segment({ fromCityId: 'damascus', toCityId: 'aleppo', price: 45000 })]
        )
        repository.findOne.mockResolvedValue(trip)

        const result = await service.findById('trip-x')

        expect(result).toEqual(trip)
        expect(repository.findOne).toHaveBeenCalledWith({
            where: { id: 'trip-x' },
            relations: { company: true, stations: true, segmentPrices: true },
        })
    })
})
