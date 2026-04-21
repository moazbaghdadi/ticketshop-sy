import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm'
import { TripEntity } from './trip.entity'

@Entity('trip_stations')
@Unique('uq_trip_station_order', ['tripId', 'order'])
@Unique('uq_trip_station_city', ['tripId', 'cityId'])
export class TripStationEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index()
    @Column('uuid')
    tripId!: string

    @ManyToOne(() => TripEntity, trip => trip.stations, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tripId' })
    trip!: TripEntity

    @Column()
    cityId!: string

    @Column('int')
    order!: number

    @Column({ type: 'varchar', nullable: true })
    arrivalTime!: string | null

    @Column({ type: 'varchar', nullable: true })
    departureTime!: string | null
}
