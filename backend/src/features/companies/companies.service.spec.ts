import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CompaniesService } from './companies.service'
import { CompanyEntity } from './entities/company.entity'

describe('CompaniesService', () => {
    let service: CompaniesService
    let repository: jest.Mocked<Repository<CompanyEntity>>

    const mockCompany: CompanyEntity = {
        id: 'company-uuid',
        nameAr: 'الأهلية',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    }

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CompaniesService,
                {
                    provide: getRepositoryToken(CompanyEntity),
                    useValue: {
                        find: jest.fn(),
                        findOneBy: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = module.get<CompaniesService>(CompaniesService)
        repository = module.get(getRepositoryToken(CompanyEntity))
    })

    it('should return all companies ordered by Arabic name', async () => {
        repository.find.mockResolvedValue([mockCompany])

        const result = await service.findAll()

        expect(result).toEqual([mockCompany])
        expect(repository.find).toHaveBeenCalledWith({ order: { nameAr: 'ASC' } })
    })

    it('should find company by id', async () => {
        repository.findOneBy.mockResolvedValue(mockCompany)

        const result = await service.findById('company-uuid')

        expect(result).toBe(mockCompany)
    })

    it('should throw NotFoundException when company id is missing', async () => {
        repository.findOneBy.mockResolvedValue(null)

        await expect(service.findById('missing')).rejects.toThrow(NotFoundException)
    })

    it('findByNameAr should return null when missing', async () => {
        repository.findOneBy.mockResolvedValue(null)

        const result = await service.findByNameAr('nonexistent')

        expect(result).toBeNull()
    })
})
