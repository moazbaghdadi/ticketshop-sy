import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { TripEntity } from '../../trips/entities/trip.entity'

interface TripSnapshot {
    id: string
    fromCityId: string
    toCityId: string
    company: string
    departureTime: string
    arrivalTime: string
    duration: string
    durationMinutes: number
    stops: number
    price: number
    date: string
}

interface SeatDetail {
    id: number
    row: number
    col: number
    gender: 'male' | 'female'
}

@Entity('bookings')
export class BookingEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Column({ unique: true })
    reference!: string

    @Column('uuid')
    tripId!: string

    @ManyToOne(() => TripEntity, { onDelete: 'CASCADE' })
    trip!: TripEntity

    @Column('jsonb')
    tripSnapshot!: TripSnapshot

    @Column('int', { array: true })
    seatIds!: number[]

    @Column('jsonb')
    seatDetails!: SeatDetail[]

    @Column()
    paymentMethod!: string

    @Column('int')
    totalPrice!: number

    @Column({ default: 'confirmed' })
    status!: string

    @CreateDateColumn()
    createdAt!: Date
}
