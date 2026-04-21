import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CompaniesService } from './companies.service'
import { CompanyEntity } from './entities/company.entity'

@Module({
    imports: [TypeOrmModule.forFeature([CompanyEntity])],
    providers: [CompaniesService],
    exports: [CompaniesService, TypeOrmModule],
})
export class CompaniesModule {}
