import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { CompanyEntity } from '../../companies/entities/company.entity'

@Entity('trips')
export class TripEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Column()
    fromCityId!: string

    @Column()
    toCityId!: string

    @Index()
    @Column('uuid')
    companyId!: string

    @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'companyId' })
    company!: CompanyEntity

    @Column()
    departureTime!: string

    @Column()
    arrivalTime!: string

    @Column()
    duration!: string

    @Column('int')
    durationMinutes!: number

    @Column('int')
    stops!: number

    @Column('int')
    price!: number

    @Column('date')
    date!: string
}
