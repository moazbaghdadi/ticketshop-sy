import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'
import { TripEntity } from '../trips/entities/trip.entity'
import { DriverEntity } from './entities/driver.entity'

export interface DriverDto {
    id: string
    nameAr: string
    createdAt: string
}

export interface UpcomingTripsConflict {
    upcomingTripCount: number
    sampleTripDates: string[]
}

@Injectable()
export class DriversService {
    constructor(
        @InjectRepository(DriverEntity)
        private readonly driverRepository: Repository<DriverEntity>,
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>,
        private readonly dataSource: DataSource
    ) {}

    async list(companyId: string, query?: string): Promise<DriverDto[]> {
        const qb = this.driverRepository
            .createQueryBuilder('d')
            .where('d.companyId = :companyId', { companyId })
            .andWhere('d.deletedAt IS NULL')
            .orderBy('d.nameAr', 'ASC')

        if (query && query.trim()) {
            qb.andWhere('d.nameAr ILIKE :q', { q: `%${query.trim()}%` })
        }

        const rows = await qb.getMany()
        return rows.map(this.toDto)
    }

    async get(companyId: string, id: string): Promise<DriverDto> {
        const driver = await this.driverRepository.findOne({ where: { id } })
        if (!driver || driver.deletedAt) {
            throw new NotFoundException(`Driver ${id} not found`)
        }
        if (driver.companyId !== companyId) {
            throw new ForbiddenException('Cannot view a driver from another company')
        }
        return this.toDto(driver)
    }

    async create(companyId: string, nameAr: string): Promise<DriverDto> {
        const trimmed = nameAr.trim()
        if (!trimmed) {
            throw new BadRequestException('nameAr must not be blank')
        }
        const existing = await this.findActiveByName(companyId, trimmed)
        if (existing) {
            return this.toDto(existing)
        }
        const created = await this.driverRepository.save(
            this.driverRepository.create({ companyId, nameAr: trimmed, deletedAt: null })
        )
        return this.toDto(created)
    }

    /**
     * Find the active (non-soft-deleted) driver matching nameAr (case-insensitive trim) within
     * a company; if none exists, create one. Used by trip-create to upsert drivers from a free-text name.
     */
    async findOrCreate(companyId: string, nameAr: string): Promise<DriverEntity> {
        const trimmed = nameAr.trim()
        if (!trimmed) {
            throw new BadRequestException('Driver nameAr must not be blank')
        }
        const existing = await this.findActiveByName(companyId, trimmed)
        if (existing) return existing
        return this.driverRepository.save(this.driverRepository.create({ companyId, nameAr: trimmed, deletedAt: null }))
    }

    async resolveActive(companyId: string, id: string): Promise<DriverEntity> {
        const driver = await this.driverRepository.findOne({ where: { id } })
        if (!driver || driver.deletedAt) {
            throw new NotFoundException(`Driver ${id} not found`)
        }
        if (driver.companyId !== companyId) {
            throw new ForbiddenException('Cannot use a driver from another company')
        }
        return driver
    }

    async update(companyId: string, id: string, nameAr: string): Promise<DriverDto> {
        const driver = await this.driverRepository.findOne({ where: { id } })
        if (!driver || driver.deletedAt) {
            throw new NotFoundException(`Driver ${id} not found`)
        }
        if (driver.companyId !== companyId) {
            throw new ForbiddenException('Cannot edit a driver from another company')
        }
        const trimmed = nameAr.trim()
        if (!trimmed) {
            throw new BadRequestException('nameAr must not be blank')
        }
        const collision = await this.findActiveByName(companyId, trimmed)
        if (collision && collision.id !== id) {
            throw new ConflictException(`Another active driver already has the name "${trimmed}"`)
        }
        driver.nameAr = trimmed
        await this.driverRepository.save(driver)
        return this.toDto(driver)
    }

    /**
     * Soft-delete a driver. If the driver is referenced by upcoming (date >= today) non-cancelled
     * trips and no replacementDriverId is provided, throws 409 with the conflict info so the
     * frontend can prompt the user. With replacementDriverId, reassigns those trips and soft-deletes
     * in one transaction.
     */
    async remove(companyId: string, id: string, replacementDriverId?: string): Promise<void> {
        const driver = await this.driverRepository.findOne({ where: { id } })
        if (!driver || driver.deletedAt) {
            throw new NotFoundException(`Driver ${id} not found`)
        }
        if (driver.companyId !== companyId) {
            throw new ForbiddenException('Cannot delete a driver from another company')
        }

        const upcoming = await this.findUpcomingConflicts(id)

        if (upcoming.upcomingTripCount > 0 && !replacementDriverId) {
            throw new ConflictException({
                message: 'Driver is assigned to upcoming trips; supply replacementDriverId to reassign them.',
                ...upcoming,
            })
        }

        if (replacementDriverId) {
            if (replacementDriverId === id) {
                throw new BadRequestException('Replacement driver must be different from the driver being deleted')
            }
            const replacement = await this.driverRepository.findOne({ where: { id: replacementDriverId } })
            if (!replacement || replacement.deletedAt) {
                throw new NotFoundException(`Replacement driver ${replacementDriverId} not found`)
            }
            if (replacement.companyId !== companyId) {
                throw new ForbiddenException('Replacement driver must belong to the same company')
            }
        }

        await this.dataSource.transaction(async manager => {
            if (replacementDriverId) {
                await manager
                    .createQueryBuilder()
                    .update(TripEntity)
                    .set({ driverId: replacementDriverId })
                    .where('driverId = :id AND date >= CURRENT_DATE AND cancelledAt IS NULL', { id })
                    .execute()
            }
            await manager.update(DriverEntity, { id }, { deletedAt: new Date() })
        })
    }

    private async findUpcomingConflicts(driverId: string): Promise<UpcomingTripsConflict> {
        const trips = await this.tripRepository
            .createQueryBuilder('t')
            .select(['t.id', 't.date'])
            .where('t.driverId = :driverId', { driverId })
            .andWhere('t.date >= CURRENT_DATE')
            .andWhere('t.cancelledAt IS NULL')
            .orderBy('t.date', 'ASC')
            .limit(5)
            .getMany()

        const total = await this.tripRepository
            .createQueryBuilder('t')
            .where('t.driverId = :driverId', { driverId })
            .andWhere('t.date >= CURRENT_DATE')
            .andWhere('t.cancelledAt IS NULL')
            .getCount()

        return {
            upcomingTripCount: total,
            sampleTripDates: trips.map(t => t.date),
        }
    }

    private async findActiveByName(companyId: string, nameAr: string): Promise<DriverEntity | null> {
        return this.driverRepository
            .createQueryBuilder('d')
            .where('d.companyId = :companyId', { companyId })
            .andWhere('LOWER(TRIM(d.nameAr)) = LOWER(:nameAr)', { nameAr })
            .andWhere('d.deletedAt IS NULL')
            .getOne()
    }

    private toDto = (driver: DriverEntity): DriverDto => ({
        id: driver.id,
        nameAr: driver.nameAr,
        createdAt: driver.createdAt.toISOString(),
    })

    /**
     * Test/util method — fetch a driver row regardless of soft-delete state, for tests that need to
     * verify the row was soft-deleted (deletedAt set) rather than hard-deleted.
     */
    async findRawForTest(id: string): Promise<DriverEntity | null> {
        return this.driverRepository.findOne({ where: { id } })
    }

    /**
     * For seeders only: ensure each given company has at least one driver, returning the
     * driver per company. Idempotent.
     */
    async seedDefaultDrivers(companyIds: string[]): Promise<Map<string, DriverEntity>> {
        const result = new Map<string, DriverEntity>()
        for (const companyId of companyIds) {
            const existing = await this.driverRepository.findOne({
                where: { companyId, deletedAt: IsNull() },
                order: { createdAt: 'ASC' },
            })
            if (existing) {
                result.set(companyId, existing)
                continue
            }
            const created = await this.driverRepository.save(
                this.driverRepository.create({ companyId, nameAr: 'سائق افتراضي', deletedAt: null })
            )
            result.set(companyId, created)
        }
        return result
    }
}
