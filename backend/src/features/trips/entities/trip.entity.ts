import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm'
import { CompanyEntity } from '../../companies/entities/company.entity'
import { TripSegmentPriceEntity } from './trip-segment-price.entity'
import { TripStationEntity } from './trip-station.entity'

@Entity('trips')
export class TripEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index()
    @Column('uuid')
    companyId!: string

    @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'companyId' })
    company!: CompanyEntity

    @Index()
    @Column('date')
    date!: string

    @OneToMany(() => TripStationEntity, station => station.trip, { cascade: true })
    stations!: TripStationEntity[]

    @OneToMany(() => TripSegmentPriceEntity, price => price.trip, { cascade: true })
    segmentPrices!: TripSegmentPriceEntity[]

    @Column({ type: 'timestamptz', nullable: true })
    cancelledAt!: Date | null

    @Column({ type: 'varchar', nullable: true })
    cancelledReason!: string | null
}
