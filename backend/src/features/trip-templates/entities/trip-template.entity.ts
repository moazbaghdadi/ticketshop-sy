import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm'
import { CompanyEntity } from '../../companies/entities/company.entity'
import { DriverEntity } from '../../drivers/entities/driver.entity'
import { TripTemplateSegmentPriceEntity } from './trip-template-segment-price.entity'
import { TripTemplateStationEntity } from './trip-template-station.entity'

@Entity('trip_templates')
export class TripTemplateEntity {
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

    @Index()
    @Column('uuid')
    driverId!: string

    @ManyToOne(() => DriverEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'driverId' })
    driver!: DriverEntity

    @OneToMany(() => TripTemplateStationEntity, station => station.template, { cascade: true })
    stations!: TripTemplateStationEntity[]

    @OneToMany(() => TripTemplateSegmentPriceEntity, price => price.template, { cascade: true })
    segmentPrices!: TripTemplateSegmentPriceEntity[]

    @CreateDateColumn()
    createdAt!: Date
}
