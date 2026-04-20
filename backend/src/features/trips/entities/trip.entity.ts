import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('trips')
export class TripEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Column()
    fromCityId!: string

    @Column()
    toCityId!: string

    @Column()
    company!: string

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
