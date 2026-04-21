import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { CompanyEntity } from '../../companies/entities/company.entity'

export type UserRole = 'agent'

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

    @Column({ default: 'agent' })
    role!: UserRole

    @CreateDateColumn()
    createdAt!: Date
}
