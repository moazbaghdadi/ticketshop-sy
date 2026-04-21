import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm'
import { TripEntity } from './trip.entity'

@Entity('trip_segment_prices')
@Unique('uq_trip_segment_pair', ['tripId', 'fromCityId', 'toCityId'])
export class TripSegmentPriceEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index()
    @Column('uuid')
    tripId!: string

    @ManyToOne(() => TripEntity, trip => trip.segmentPrices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tripId' })
    trip!: TripEntity

    @Column()
    fromCityId!: string

    @Column()
    toCityId!: string

    @Column('int')
    price!: number
}
