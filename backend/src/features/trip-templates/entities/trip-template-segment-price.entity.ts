import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm'
import { TripTemplateEntity } from './trip-template.entity'

@Entity('trip_template_segment_prices')
@Unique('uq_trip_template_segment_pair', ['templateId', 'fromCityId', 'toCityId'])
export class TripTemplateSegmentPriceEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index()
    @Column('uuid')
    templateId!: string

    @ManyToOne(() => TripTemplateEntity, t => t.segmentPrices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'templateId' })
    template!: TripTemplateEntity

    @Column()
    fromCityId!: string

    @Column()
    toCityId!: string

    @Column('int')
    price!: number
}
