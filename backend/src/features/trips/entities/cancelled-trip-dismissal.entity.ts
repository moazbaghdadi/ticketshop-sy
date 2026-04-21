import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

@Entity('cancelled_trip_dismissals')
@Unique('uq_cancelled_trip_dismissal_user_trip', ['userId', 'tripId'])
export class CancelledTripDismissalEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index()
    @Column('uuid')
    userId!: string

    @Index()
    @Column('uuid')
    tripId!: string

    @CreateDateColumn()
    dismissedAt!: Date
}
