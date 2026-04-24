import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { UserRole } from '@ticketshop-sy/shared-models'
import { CompanyEntity } from '../../companies/entities/company.entity'

@Entity('invitations')
export class InvitationEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index({ unique: true })
    @Column()
    token!: string

    @Column()
    email!: string

    @Index()
    @Column('uuid')
    companyId!: string

    @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'companyId' })
    company!: CompanyEntity

    @Column({ type: 'text' })
    role!: UserRole

    @Column({ type: 'timestamptz' })
    expiresAt!: Date

    @Column({ type: 'timestamptz', nullable: true })
    acceptedAt!: Date | null

    @CreateDateColumn()
    createdAt!: Date
}
