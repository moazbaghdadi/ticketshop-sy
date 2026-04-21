import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CompanyEntity } from './entities/company.entity'

@Injectable()
export class CompaniesService {
    constructor(
        @InjectRepository(CompanyEntity)
        private readonly companyRepository: Repository<CompanyEntity>
    ) {}

    findAll(): Promise<CompanyEntity[]> {
        return this.companyRepository.find({ order: { nameAr: 'ASC' } })
    }

    async findById(id: string): Promise<CompanyEntity> {
        const company = await this.companyRepository.findOneBy({ id })
        if (!company) {
            throw new NotFoundException(`Company ${id} not found`)
        }
        return company
    }

    async findByNameAr(nameAr: string): Promise<CompanyEntity | null> {
        return this.companyRepository.findOneBy({ nameAr })
    }
}
