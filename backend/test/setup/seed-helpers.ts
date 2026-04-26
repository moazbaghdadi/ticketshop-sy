import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UserRole } from '@ticketshop-sy/shared-models'
import * as bcrypt from 'bcryptjs'
import { DataSource, IsNull } from 'typeorm'
import { UserEntity } from '../../src/features/auth/entities/user.entity'
import { JwtPayload } from '../../src/features/auth/jwt.strategy'
import { CompanyEntity } from '../../src/features/companies/entities/company.entity'
import { DriverEntity } from '../../src/features/drivers/entities/driver.entity'
import { TripSegmentPriceEntity } from '../../src/features/trips/entities/trip-segment-price.entity'
import { TripStationEntity } from '../../src/features/trips/entities/trip-station.entity'
import { TripEntity } from '../../src/features/trips/entities/trip.entity'

export interface CreatedUser {
    id: string
    email: string
    companyId: string
    role: UserRole
    accessToken: string
}

export async function createCompany(ds: DataSource, nameAr: string): Promise<CompanyEntity> {
    const repo = ds.getRepository(CompanyEntity)
    return repo.save(repo.create({ nameAr }))
}

export async function createUser(
    app: INestApplication,
    ds: DataSource,
    opts: { email: string; companyId: string; role: UserRole; password?: string }
): Promise<CreatedUser> {
    const passwordHash = await bcrypt.hash(opts.password ?? 'password123', 4)
    const userRepo = ds.getRepository(UserEntity)
    const user = await userRepo.save(
        userRepo.create({
            email: opts.email.toLowerCase(),
            passwordHash,
            companyId: opts.companyId,
            role: opts.role,
        })
    )
    const jwt = app.get(JwtService)
    const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
        companyId: user.companyId,
        role: user.role,
    }
    const accessToken = jwt.sign(payload)
    return { id: user.id, email: user.email, companyId: user.companyId, role: user.role, accessToken }
}

export interface StationDef {
    cityId: string
    order: number
    arrivalTime: string | null
    departureTime: string | null
}

export interface PriceDef {
    fromCityId: string
    toCityId: string
    price: number
}

/**
 * Find or create a driver for the given company. Used by createTrip to satisfy the NOT-NULL
 * driverId constraint when callers don't supply one explicitly.
 */
export async function ensureDriver(ds: DataSource, companyId: string, nameAr = 'سائق اختبار'): Promise<DriverEntity> {
    const repo = ds.getRepository(DriverEntity)
    const existing = await repo.findOne({ where: { companyId, nameAr, deletedAt: IsNull() } })
    if (existing) return existing
    return repo.save(repo.create({ companyId, nameAr, deletedAt: null }))
}

export async function createDriver(ds: DataSource, companyId: string, nameAr: string): Promise<DriverEntity> {
    const repo = ds.getRepository(DriverEntity)
    return repo.save(repo.create({ companyId, nameAr, deletedAt: null }))
}

/**
 * Create a trip directly in the database with stations + segment prices wired in.
 * Bypasses DashboardTripsService.create() validation so tests can stage routes
 * (including ones that wouldn't pass dashboard validation) for the read endpoints.
 *
 * If driverId is omitted, a default driver for the company is auto-created via ensureDriver.
 */
export async function createTrip(
    ds: DataSource,
    opts: { companyId: string; driverId?: string; date: string; stations: StationDef[]; prices: PriceDef[] }
): Promise<TripEntity> {
    const repo = ds.getRepository(TripEntity)
    const driverId = opts.driverId ?? (await ensureDriver(ds, opts.companyId)).id
    const trip = await repo.save(
        repo.create({
            companyId: opts.companyId,
            driverId,
            date: opts.date,
            stations: opts.stations.map(s =>
                Object.assign(new TripStationEntity(), {
                    cityId: s.cityId,
                    order: s.order,
                    arrivalTime: s.arrivalTime,
                    departureTime: s.departureTime,
                })
            ),
            segmentPrices: opts.prices.map(p =>
                Object.assign(new TripSegmentPriceEntity(), {
                    fromCityId: p.fromCityId,
                    toCityId: p.toCityId,
                    price: p.price,
                })
            ),
        })
    )
    // Reload so .stations / .segmentPrices come back populated for callers that need them.
    return repo.findOneOrFail({
        where: { id: trip.id },
        relations: { stations: true, segmentPrices: true, company: true, driver: true },
    })
}

/**
 * Common 3-station trip used by most booking-flow tests:
 *   damascus(0) → homs(1) → aleppo(2)
 * with all 3 pair prices.
 */
export function damascusHomsAleppoStations(): StationDef[] {
    return [
        { cityId: 'damascus', order: 0, arrivalTime: null, departureTime: '08:00' },
        { cityId: 'homs', order: 1, arrivalTime: '10:00', departureTime: '10:15' },
        { cityId: 'aleppo', order: 2, arrivalTime: '13:00', departureTime: null },
    ]
}

export function damascusHomsAleppoPrices(): PriceDef[] {
    return [
        { fromCityId: 'damascus', toCityId: 'homs', price: 10000 },
        { fromCityId: 'damascus', toCityId: 'aleppo', price: 25000 },
        { fromCityId: 'homs', toCityId: 'aleppo', price: 16000 },
    ]
}
