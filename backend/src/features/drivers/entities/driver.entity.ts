import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { CompanyEntity } from '../../companies/entities/company.entity'

@Entity('drivers')
@Index('ix_drivers_company_active', ['companyId'], { where: '"deletedAt" IS NULL' })
export class DriverEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index()
    @Column('uuid')
    companyId!: string

    @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'companyId' })
    company!: CompanyEntity

    @Column()
    nameAr!: string

    @Column({ type: 'timestamptz', nullable: true })
    deletedAt!: Date | null

    @CreateDateColumn()
    createdAt!: Date
}
