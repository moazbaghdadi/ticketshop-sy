import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('companies')
export class CompanyEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string

    @Column()
    nameAr!: string

    @CreateDateColumn()
    createdAt!: Date
}
