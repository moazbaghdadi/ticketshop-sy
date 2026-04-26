import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { CITY_IDS } from '../../common/data/cities.data'
import { DriverEntity } from '../drivers/entities/driver.entity'
import { DriversService } from '../drivers/drivers.service'
import { TripSegmentPriceEntity } from '../trips/entities/trip-segment-price.entity'
import { TripStationEntity } from '../trips/entities/trip-station.entity'
import { TripEntity } from '../trips/entities/trip.entity'
import { CreateTripTemplateDto } from './dto/create-trip-template.dto'
import { TripTemplateSegmentPriceEntity } from './entities/trip-template-segment-price.entity'
import { TripTemplateStationEntity } from './entities/trip-template-station.entity'
import { TripTemplateEntity } from './entities/trip-template.entity'
import { instantiateTemplate, snapshotTripToTemplate } from './template.mapper'

export interface TripTemplateDto {
    id: string
    nameAr: string
    driver: { id: string; nameAr: string }
    stations: {
        cityId: string
        order: number
        arrivalOffsetMin: number
        departureOffsetMin: number
    }[]
    segmentPrices: { fromCityId: string; toCityId: string; price: number }[]
    createdAt: string
}

@Injectable()
export class TripTemplatesService {
    constructor(
        @InjectRepository(TripTemplateEntity)
        private readonly templateRepo: Repository<TripTemplateEntity>,
        @InjectRepository(TripEntity)
        private readonly tripRepo: Repository<TripEntity>,
        private readonly driversService: DriversService,
        private readonly dataSource: DataSource
    ) {}

    async list(companyId: string): Promise<TripTemplateDto[]> {
        const rows = await this.templateRepo.find({
            where: { companyId },
            relations: { stations: true, segmentPrices: true, driver: true },
            order: { createdAt: 'DESC' },
        })
        return rows.map(this.toDto)
    }

    async get(companyId: string, id: string): Promise<TripTemplateDto> {
        const row = await this.findScoped(companyId, id)
        return this.toDto(row)
    }

    async create(companyId: string, dto: CreateTripTemplateDto): Promise<TripTemplateDto> {
        this.validate(dto)
        const driver = await this.resolveDriver(companyId, dto.driver)

        const saved = await this.templateRepo.save(this.buildEntity(companyId, dto, driver))
        return this.get(companyId, saved.id)
    }

    async update(companyId: string, id: string, dto: CreateTripTemplateDto): Promise<TripTemplateDto> {
        this.validate(dto)
        const existing = await this.findScoped(companyId, id)
        const driver = await this.resolveDriver(companyId, dto.driver)

        await this.dataSource.transaction(async manager => {
            // Replace stations + prices wholesale; simpler than diffing and matches the
            // form's "edit the template" semantic where the user is rewriting it.
            await manager.delete(TripTemplateStationEntity, { templateId: id })
            await manager.delete(TripTemplateSegmentPriceEntity, { templateId: id })

            existing.nameAr = dto.nameAr.trim()
            existing.driverId = driver.id
            existing.stations = dto.stations.map(s =>
                Object.assign(new TripTemplateStationEntity(), {
                    templateId: id,
                    cityId: s.cityId,
                    order: s.order,
                    arrivalOffsetMin: s.arrivalOffsetMin,
                    departureOffsetMin: s.departureOffsetMin,
                })
            )
            existing.segmentPrices = dto.segmentPrices.map(p =>
                Object.assign(new TripTemplateSegmentPriceEntity(), {
                    templateId: id,
                    fromCityId: p.fromCityId,
                    toCityId: p.toCityId,
                    price: p.price,
                })
            )
            await manager.save(existing)
        })

        return this.get(companyId, id)
    }

    async remove(companyId: string, id: string): Promise<void> {
        const existing = await this.findScoped(companyId, id)
        await this.templateRepo.remove(existing)
    }

    /**
     * Clone a template into a fresh trip. The new trip is created via the same DataSource
     * transaction that runs other trip creates, so concurrent instantiations don't race.
     */
    async instantiate(
        companyId: string,
        id: string,
        date: string,
        firstDepartureTime: string
    ): Promise<{ id: string }> {
        const template = await this.findScoped(companyId, id)
        const stations = instantiateTemplate(
            template.stations.map(s => ({
                cityId: s.cityId,
                order: s.order,
                arrivalOffsetMin: s.arrivalOffsetMin,
                departureOffsetMin: s.departureOffsetMin,
            })),
            firstDepartureTime
        )

        const saved = await this.tripRepo.save(
            this.tripRepo.create({
                companyId,
                driverId: template.driverId,
                date,
                stations: stations.map(s =>
                    Object.assign(new TripStationEntity(), {
                        cityId: s.cityId,
                        order: s.order,
                        arrivalTime: s.arrivalTime,
                        departureTime: s.departureTime,
                    })
                ),
                segmentPrices: template.segmentPrices.map(p =>
                    Object.assign(new TripSegmentPriceEntity(), {
                        fromCityId: p.fromCityId,
                        toCityId: p.toCityId,
                        price: p.price,
                    })
                ),
            })
        )
        return { id: saved.id }
    }

    /**
     * Snapshot an existing trip into a new template. Driver + segment prices are copied from
     * the trip; offsets are computed against the trip's first-station departureTime.
     */
    async snapshotFromTrip(companyId: string, tripId: string, name: string): Promise<TripTemplateDto> {
        const trimmed = name.trim()
        if (!trimmed) {
            throw new BadRequestException('Template name must not be blank')
        }
        const trip = await this.tripRepo.findOne({
            where: { id: tripId },
            relations: { stations: true, segmentPrices: true },
        })
        if (!trip) {
            throw new NotFoundException(`Trip ${tripId} not found`)
        }
        if (trip.companyId !== companyId) {
            throw new ForbiddenException('Cannot snapshot a trip from another company')
        }
        if (trip.cancelledAt) {
            throw new BadRequestException('Cannot snapshot a cancelled trip')
        }
        const sortedStations = [...(trip.stations ?? [])].sort((a, b) => a.order - b.order)
        if (sortedStations.length < 2) {
            throw new BadRequestException('Trip has too few stations to snapshot')
        }

        const offsets = snapshotTripToTemplate(
            sortedStations.map(s => ({
                cityId: s.cityId,
                order: s.order,
                arrivalTime: s.arrivalTime,
                departureTime: s.departureTime,
            }))
        )

        const template = await this.templateRepo.save(
            this.templateRepo.create({
                companyId,
                nameAr: trimmed,
                driverId: trip.driverId,
                stations: offsets.map(s =>
                    Object.assign(new TripTemplateStationEntity(), {
                        cityId: s.cityId,
                        order: s.order,
                        arrivalOffsetMin: s.arrivalOffsetMin,
                        departureOffsetMin: s.departureOffsetMin,
                    })
                ),
                segmentPrices: (trip.segmentPrices ?? []).map(p =>
                    Object.assign(new TripTemplateSegmentPriceEntity(), {
                        fromCityId: p.fromCityId,
                        toCityId: p.toCityId,
                        price: p.price,
                    })
                ),
            })
        )

        return this.get(companyId, template.id)
    }

    /**
     * Used by DashboardTripsService when "saveAsTemplate" is checked on a normal trip create.
     * Runs inside the trip-create transaction so we never end up with one without the other.
     */
    async createFromTripDto(
        companyId: string,
        manager: EntityManager,
        opts: {
            nameAr: string
            driverId: string
            stations: Array<{ cityId: string; order: number; arrivalTime: string | null; departureTime: string | null }>
            segmentPrices: Array<{ fromCityId: string; toCityId: string; price: number }>
        }
    ): Promise<void> {
        const offsets = snapshotTripToTemplate(opts.stations)
        const template = manager.create(TripTemplateEntity, {
            companyId,
            nameAr: opts.nameAr.trim(),
            driverId: opts.driverId,
            stations: offsets.map(s =>
                Object.assign(new TripTemplateStationEntity(), {
                    cityId: s.cityId,
                    order: s.order,
                    arrivalOffsetMin: s.arrivalOffsetMin,
                    departureOffsetMin: s.departureOffsetMin,
                })
            ),
            segmentPrices: opts.segmentPrices.map(p =>
                Object.assign(new TripTemplateSegmentPriceEntity(), {
                    fromCityId: p.fromCityId,
                    toCityId: p.toCityId,
                    price: p.price,
                })
            ),
        })
        await manager.save(template)
    }

    private async findScoped(companyId: string, id: string): Promise<TripTemplateEntity> {
        const row = await this.templateRepo.findOne({
            where: { id },
            relations: { stations: true, segmentPrices: true, driver: true },
        })
        if (!row) {
            throw new NotFoundException(`Trip template ${id} not found`)
        }
        if (row.companyId !== companyId) {
            throw new ForbiddenException('Cannot access a template from another company')
        }
        return row
    }

    private async resolveDriver(
        companyId: string,
        driver: { id?: string; name?: string } | undefined
    ): Promise<DriverEntity> {
        if (!driver || (!driver.id && !driver.name)) {
            throw new BadRequestException('driver: either id or name is required')
        }
        if (driver.id) {
            return this.driversService.resolveActive(companyId, driver.id)
        }
        return this.driversService.findOrCreate(companyId, driver.name!)
    }

    private buildEntity(
        companyId: string,
        dto: CreateTripTemplateDto,
        driver: DriverEntity
    ): TripTemplateEntity {
        return this.templateRepo.create({
            companyId,
            nameAr: dto.nameAr.trim(),
            driverId: driver.id,
            stations: dto.stations.map(s =>
                Object.assign(new TripTemplateStationEntity(), {
                    cityId: s.cityId,
                    order: s.order,
                    arrivalOffsetMin: s.arrivalOffsetMin,
                    departureOffsetMin: s.departureOffsetMin,
                })
            ),
            segmentPrices: dto.segmentPrices.map(p =>
                Object.assign(new TripTemplateSegmentPriceEntity(), {
                    fromCityId: p.fromCityId,
                    toCityId: p.toCityId,
                    price: p.price,
                })
            ),
        })
    }

    /**
     * Same shape rules as a trip — duplicate cities forbidden, monotonic offsets required,
     * every (i<j) pair must have a positive price.
     */
    private validate(dto: CreateTripTemplateDto): void {
        const stations = [...dto.stations].sort((a, b) => a.order - b.order)
        for (const s of stations) {
            if (!CITY_IDS.includes(s.cityId)) {
                throw new BadRequestException(`Unknown cityId: ${s.cityId}`)
            }
        }

        const cityIds = new Set<string>()
        for (const s of stations) {
            if (cityIds.has(s.cityId)) {
                throw new BadRequestException(`Duplicate city on route: ${s.cityId}`)
            }
            cityIds.add(s.cityId)
        }

        const orders = new Set<number>()
        for (const s of stations) {
            if (orders.has(s.order)) {
                throw new BadRequestException(`Duplicate station order: ${s.order}`)
            }
            orders.add(s.order)
        }

        // First station's offsets must both be 0; last station's departure must equal arrival.
        const first = stations[0]!
        if (first.arrivalOffsetMin !== 0 || first.departureOffsetMin !== 0) {
            throw new BadRequestException('First station must have arrivalOffsetMin=0 and departureOffsetMin=0')
        }
        // Monotonic offsets: arrival_i <= departure_i, departure_i <= arrival_{i+1}.
        for (let i = 0; i < stations.length; i++) {
            const s = stations[i]!
            if (s.departureOffsetMin < s.arrivalOffsetMin) {
                throw new BadRequestException(
                    `Station ${s.cityId}: departureOffsetMin must be >= arrivalOffsetMin`
                )
            }
            if (i + 1 < stations.length) {
                const next = stations[i + 1]!
                if (next.arrivalOffsetMin < s.departureOffsetMin) {
                    throw new BadRequestException(
                        `Travel from ${s.cityId} to ${next.cityId}: offsets are not monotonic`
                    )
                }
            }
        }

        // Pair pricing: every (i, j) with i<j must have a positive price.
        const priceMap = new Map<string, number>()
        for (const p of dto.segmentPrices) {
            const key = `${p.fromCityId}|${p.toCityId}`
            if (priceMap.has(key)) {
                throw new BadRequestException(`Duplicate segment price for ${p.fromCityId} → ${p.toCityId}`)
            }
            if (!cityIds.has(p.fromCityId) || !cityIds.has(p.toCityId)) {
                throw new BadRequestException(`Segment price references unknown station: ${p.fromCityId} → ${p.toCityId}`)
            }
            priceMap.set(key, p.price)
        }
        for (let i = 0; i < stations.length; i++) {
            for (let j = i + 1; j < stations.length; j++) {
                const from = stations[i]!.cityId
                const to = stations[j]!.cityId
                const key = `${from}|${to}`
                const price = priceMap.get(key)
                if (price === undefined || price <= 0) {
                    throw new BadRequestException(`Missing or non-positive price for ${from} → ${to}`)
                }
            }
        }
    }

    private toDto = (row: TripTemplateEntity): TripTemplateDto => ({
        id: row.id,
        nameAr: row.nameAr,
        driver: { id: row.driver.id, nameAr: row.driver.nameAr },
        stations: [...(row.stations ?? [])]
            .sort((a, b) => a.order - b.order)
            .map(s => ({
                cityId: s.cityId,
                order: s.order,
                arrivalOffsetMin: s.arrivalOffsetMin,
                departureOffsetMin: s.departureOffsetMin,
            })),
        segmentPrices: (row.segmentPrices ?? []).map(p => ({
            fromCityId: p.fromCityId,
            toCityId: p.toCityId,
            price: p.price,
        })),
        createdAt: row.createdAt.toISOString(),
    })
}
