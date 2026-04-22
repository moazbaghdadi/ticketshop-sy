import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CITY_MAP } from '../../common/data/cities.data'
import { BookingEntity } from '../bookings/entities/booking.entity'
import { EmailService } from '../mail/email.service'
import { TripEntity } from '../trips/entities/trip.entity'

export interface ReportTotals {
    bookings: number
    seats: number
    revenue: number
    trips: number
}

export interface ReportPerDay {
    date: string
    bookings: number
    seats: number
    revenue: number
}

export interface ReportPerRoute {
    fromCityId: string
    fromCity: string
    toCityId: string
    toCity: string
    bookings: number
    seats: number
    revenue: number
}

export interface DashboardReport {
    from: string
    to: string
    totals: ReportTotals
    perDay: ReportPerDay[]
    perRoute: ReportPerRoute[]
}

interface AggRow {
    tripId: string
    tripDate: string
    totalPrice: number
    seatsCount: number
    boardingStationId: string
    dropoffStationId: string
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

@Injectable()
export class DashboardReportsService {
    constructor(
        @InjectRepository(TripEntity)
        private readonly tripRepository: Repository<TripEntity>,
        @InjectRepository(BookingEntity)
        private readonly bookingRepository: Repository<BookingEntity>,
        private readonly emailService: EmailService
    ) {}

    async generate(companyId: string, from: string, to: string): Promise<DashboardReport> {
        this.validateBounds(from, to)

        const rows = await this.loadRows(companyId, from, to)

        const totals: ReportTotals = {
            bookings: rows.length,
            seats: rows.reduce((acc, r) => acc + r.seatsCount, 0),
            revenue: rows.reduce((acc, r) => acc + r.totalPrice, 0),
            trips: new Set(rows.map(r => r.tripId)).size,
        }

        const perDayMap = new Map<string, ReportPerDay>()
        for (const r of rows) {
            const existing = perDayMap.get(r.tripDate)
            if (existing) {
                existing.bookings++
                existing.seats += r.seatsCount
                existing.revenue += r.totalPrice
            } else {
                perDayMap.set(r.tripDate, {
                    date: r.tripDate,
                    bookings: 1,
                    seats: r.seatsCount,
                    revenue: r.totalPrice,
                })
            }
        }
        const perDay = [...perDayMap.values()].sort((a, b) => a.date.localeCompare(b.date))

        const perRouteMap = new Map<string, ReportPerRoute>()
        for (const r of rows) {
            const key = `${r.boardingStationId}|${r.dropoffStationId}`
            const existing = perRouteMap.get(key)
            if (existing) {
                existing.bookings++
                existing.seats += r.seatsCount
                existing.revenue += r.totalPrice
            } else {
                perRouteMap.set(key, {
                    fromCityId: r.boardingStationId,
                    fromCity: CITY_MAP.get(r.boardingStationId)?.nameAr ?? r.boardingStationId,
                    toCityId: r.dropoffStationId,
                    toCity: CITY_MAP.get(r.dropoffStationId)?.nameAr ?? r.dropoffStationId,
                    bookings: 1,
                    seats: r.seatsCount,
                    revenue: r.totalPrice,
                })
            }
        }
        const perRoute = [...perRouteMap.values()].sort((a, b) => b.revenue - a.revenue)

        return { from, to, totals, perDay, perRoute }
    }

    async emailReport(companyId: string, from: string, to: string, recipient: string): Promise<void> {
        const trimmed = recipient.trim()
        if (!trimmed) {
            throw new BadRequestException('Recipient email is required')
        }
        const report = await this.generate(companyId, from, to)
        const body = this.renderHtml(report)
        await this.emailService.send({
            to: trimmed,
            subject: `تقرير المبيعات ${from} — ${to}`,
            body,
        })
    }

    private validateBounds(from: string, to: string): void {
        if (!DATE_REGEX.test(from) || !DATE_REGEX.test(to)) {
            throw new BadRequestException('from/to must be YYYY-MM-DD')
        }
        if (from > to) {
            throw new BadRequestException('from must be <= to')
        }
    }

    private async loadRows(companyId: string, from: string, to: string): Promise<AggRow[]> {
        const raw = await this.bookingRepository
            .createQueryBuilder('booking')
            .innerJoin(TripEntity, 'trip', 'trip.id = booking.tripId')
            .where('trip.companyId = :companyId', { companyId })
            .andWhere('booking.status = :status', { status: 'confirmed' })
            .andWhere('trip.date >= :from', { from })
            .andWhere('trip.date <= :to', { to })
            .select([
                'booking.id AS "id"',
                'booking.tripId AS "tripId"',
                'trip.date AS "tripDate"',
                'booking.totalPrice AS "totalPrice"',
                'booking.seatIds AS "seatIds"',
                'booking.boardingStationId AS "boardingStationId"',
                'booking.dropoffStationId AS "dropoffStationId"',
            ])
            .getRawMany<{
                id: string
                tripId: string
                tripDate: string | Date
                totalPrice: string | number
                seatIds: number[]
                boardingStationId: string
                dropoffStationId: string
            }>()

        return raw.map(r => ({
            tripId: r.tripId,
            tripDate: typeof r.tripDate === 'string' ? r.tripDate : r.tripDate.toISOString().slice(0, 10),
            totalPrice: Number(r.totalPrice),
            seatsCount: Array.isArray(r.seatIds) ? r.seatIds.length : 0,
            boardingStationId: r.boardingStationId,
            dropoffStationId: r.dropoffStationId,
        }))
    }

    private renderHtml(report: DashboardReport): string {
        const perDayRows = report.perDay
            .map(d => `<tr><td>${d.date}</td><td>${d.bookings}</td><td>${d.seats}</td><td>${d.revenue}</td></tr>`)
            .join('')
        const perRouteRows = report.perRoute
            .map(
                r => `<tr><td>${r.fromCity} → ${r.toCity}</td><td>${r.bookings}</td><td>${r.seats}</td><td>${r.revenue}</td></tr>`
            )
            .join('')
        return `
<h2>تقرير المبيعات ${report.from} — ${report.to}</h2>
<p>إجمالي الحجوزات: ${report.totals.bookings} — المقاعد: ${report.totals.seats} — الإيرادات: ${report.totals.revenue} ل.س — الرحلات: ${report.totals.trips}</p>
<h3>حسب اليوم</h3>
<table><thead><tr><th>التاريخ</th><th>حجوزات</th><th>مقاعد</th><th>الإيرادات</th></tr></thead><tbody>${perDayRows}</tbody></table>
<h3>حسب المسار</h3>
<table><thead><tr><th>المسار</th><th>حجوزات</th><th>مقاعد</th><th>الإيرادات</th></tr></thead><tbody>${perRouteRows}</tbody></table>
`.trim()
    }
}
