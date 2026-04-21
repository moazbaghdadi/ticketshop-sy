import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CompanyEntity } from '../features/companies/entities/company.entity'

export const SEED_COMPANY_NAMES = ['الأهلية', 'القدموس', 'الزنوبية', 'النورس', 'الأمانة'] as const

@Injectable()
export class CompaniesSeederService {
    constructor(
        @InjectRepository(CompanyEntity)
        private readonly companyRepository: Repository<CompanyEntity>
    ) {}

    async seed(): Promise<CompanyEntity[]> {
        const existing = await this.companyRepository.find()
        const existingByName = new Map(existing.map(c => [c.nameAr, c]))

        const result: CompanyEntity[] = []
        for (const nameAr of SEED_COMPANY_NAMES) {
            const hit = existingByName.get(nameAr)
            if (hit) {
                result.push(hit)
                continue
            }
            const created = await this.companyRepository.save(this.companyRepository.create({ nameAr }))
            result.push(created)
        }
        return result
    }
}
