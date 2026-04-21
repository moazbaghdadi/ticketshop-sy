import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CompanyEntity } from '../companies/entities/company.entity'
import { TripEntity } from './entities/trip.entity'
import { TripsService } from './trips.service'

describe('TripsService', () => {
    let service: TripsService
    let repository: jest.Mocked<Repository<TripEntity>>

    const mockCompany: CompanyEntity = {
        id: 'company-uuid',
        nameAr: 'الأهلية',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    }

    const mockTrip: TripEntity = {
        id: 'test-uuid',
        fromCityId: 'damascus',
        toCityId: 'aleppo',
        companyId: mockCompany.id,
        company: mockCompany,
        departureTime: '06:00',
        arrivalTime: '09:30',
        duration: '3 ساعات و 30 دقيقة',
        durationMinutes: 210,
        stops: 1,
        price: 45000,
        date: '2026-04-20',
    }

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

    it('should return trips mapped with city names and company', async () => {
        repository.find.mockResolvedValue([mockTrip])

        const result = await service.searchTrips('damascus', 'aleppo', '2026-04-20')

        expect(result).toHaveLength(1)
        expect(result[0]!.from).toEqual({ id: 'damascus', nameAr: 'دمشق' })
        expect(result[0]!.to).toEqual({ id: 'aleppo', nameAr: 'حلب' })
        expect(result[0]!.company).toEqual({ id: mockCompany.id, nameAr: 'الأهلية' })
        expect(result[0]!.price).toBe(45000)
    })

    it('should load the company relation when searching', async () => {
        repository.find.mockResolvedValue([mockTrip])

        await service.searchTrips('damascus', 'aleppo', '2026-04-20')

        expect(repository.find).toHaveBeenCalledWith(
            expect.objectContaining({ relations: { company: true } })
        )
    })

    it('should return empty array when no trips found', async () => {
        repository.find.mockResolvedValue([])

        const result = await service.searchTrips('damascus', 'aleppo', '2026-12-31')

        expect(result).toHaveLength(0)
    })

    it('should find trip by id with company relation', async () => {
        repository.findOne.mockResolvedValue(mockTrip)

        const result = await service.findById('test-uuid')

        expect(result).toEqual(mockTrip)
        expect(repository.findOne).toHaveBeenCalledWith({
            where: { id: 'test-uuid' },
            relations: { company: true },
        })
    })

    it('should return null for non-existent trip', async () => {
        repository.findOne.mockResolvedValue(null)

        const result = await service.findById('non-existent')

        expect(result).toBeNull()
    })
})
