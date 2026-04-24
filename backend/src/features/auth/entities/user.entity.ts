import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import type { UserRole } from '@ticketshop-sy/shared-models'
import { CompanyEntity } from '../../companies/entities/company.entity'

export type { UserRole }

@Entity('users')
export class UserEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Index({ unique: true })
    @Column()
    email!: string

    @Column({ type: 'text', nullable: true })
    passwordHash!: string | null

    @Index()
    @Column('uuid')
    companyId!: string

    @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'companyId' })
    company!: CompanyEntity

    @Column({ type: 'text' })
    role!: UserRole

    @CreateDateColumn()
    createdAt!: Date
}
