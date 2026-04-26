import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm'
import { TripTemplateEntity } from './trip-template.entity'

/**
 * One row per station on a template. Times are stored as INTEGER minute-offsets from the
 * template's reference point (first station's departure = 0). Cloning the template into a
 * trip just adds the user-provided firstDepartureTime to each offset and writes HH:mm.
 *
 * - First station: arrivalOffsetMin = 0, departureOffsetMin = 0
 * - Intermediate stations: both > 0 and monotonic
 * - Last station: arrivalOffsetMin > 0, departureOffsetMin = arrivalOffsetMin (departure unused
 *   downstream — mirrors the trip-station "last station has no departureTime" semantic)
 */
@Entity('trip_template_stations')
@Unique('uq_trip_template_station_order', ['templateId', 'order'])
@Unique('uq_trip_template_station_city', ['templateId', 'cityId'])
export class TripTemplateStationEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index()
    @Column('uuid')
    templateId!: string

    @ManyToOne(() => TripTemplateEntity, t => t.stations, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'templateId' })
    template!: TripTemplateEntity

    @Column()
    cityId!: string

    @Column('int')
    order!: number

    @Column('int')
    arrivalOffsetMin!: number

    @Column('int')
    departureOffsetMin!: number
}
