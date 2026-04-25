import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    StreamableFile,
    UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { BookingResponse } from '@ticketshop-sy/shared-models'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CreateBookingDto } from '../bookings/dto/create-booking.dto'
import { BookingStatusFilter, BookingsSearchResult, DashboardBookingsService } from './dashboard-bookings.service'
import { UpdateBookingDto } from './dto/update-booking.dto'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const STATUS_VALUES: BookingStatusFilter[] = ['all', 'past', 'ongoing', 'cancelled']

@ApiTags('dashboard-bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard/bookings')
export class DashboardBookingsController {
    constructor(private readonly dashboardBookingsService: DashboardBookingsService) {}

    @Post()
    @ApiOperation({ summary: 'Create a booking from the dashboard (bypasses gender constraint)' })
    async create(
        @CurrentUser() user: AuthenticatedUser,
        @Body() dto: CreateBookingDto
    ): Promise<{ data: BookingResponse; warning: string | null }> {
        const { booking, warning } = await this.dashboardBookingsService.create(user.companyId, dto)
        return { data: booking, warning }
    }

    @Get()
    @ApiOperation({ summary: 'Search bookings for the current user’s company' })
    @ApiQuery({ name: 'query', required: false, description: 'Matches reference, passenger name, or phone (substring)' })
    @ApiQuery({ name: 'date', required: false, description: 'Filter by trip date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'status', required: false, enum: ['all', 'past', 'ongoing', 'cancelled'] })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (1-indexed)' })
    async search(
        @CurrentUser() user: AuthenticatedUser,
        @Query('query') query?: string,
        @Query('date') date?: string,
        @Query('status') status?: string,
        @Query('page') page?: string
    ): Promise<{ data: BookingsSearchResult }> {
        const parsedPage = page ? Number(page) : 1
        const trimmedQuery = query?.trim() || undefined
        const validatedDate = date && DATE_RE.test(date) ? date : undefined

        let validatedStatus: BookingStatusFilter | undefined
        if (status !== undefined) {
            if (!(STATUS_VALUES as readonly string[]).includes(status)) {
                throw new BadRequestException(`status must be one of: ${STATUS_VALUES.join(', ')}`)
            }
            validatedStatus = status as BookingStatusFilter
        }

        const data = await this.dashboardBookingsService.search(user.companyId, {
            query: trimmedQuery,
            date: validatedDate,
            status: validatedStatus,
            page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
        })
        return { data }
    }

    @Get('export')
    @ApiOperation({ summary: 'Export bookings as CSV (UTF-8 with BOM, Excel-friendly)' })
    @ApiQuery({ name: 'query', required: false, description: 'Matches reference, passenger name, or phone (substring)' })
    @ApiQuery({ name: 'date', required: false, description: 'Filter by trip date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'status', required: false, enum: ['all', 'past', 'ongoing', 'cancelled'] })
    async exportCsv(
        @CurrentUser() user: AuthenticatedUser,
        @Query('query') query?: string,
        @Query('date') date?: string,
        @Query('status') status?: string
    ): Promise<StreamableFile> {
        const trimmedQuery = query?.trim() || undefined
        const validatedDate = date && DATE_RE.test(date) ? date : undefined

        let validatedStatus: BookingStatusFilter | undefined
        if (status !== undefined) {
            if (!(STATUS_VALUES as readonly string[]).includes(status)) {
                throw new BadRequestException(`status must be one of: ${STATUS_VALUES.join(', ')}`)
            }
            validatedStatus = status as BookingStatusFilter
        }

        const csv = await this.dashboardBookingsService.exportCsv(user.companyId, {
            query: trimmedQuery,
            date: validatedDate,
            status: validatedStatus,
        })

        const filename = `bookings-${new Date().toISOString().slice(0, 10)}.csv`
        const buffer = Buffer.from('\ufeff' + csv, 'utf-8')
        return new StreamableFile(buffer, {
            type: 'text/csv; charset=utf-8',
            disposition: `attachment; filename="${filename}"`,
        })
    }

    @Get(':reference')
    @ApiOperation({ summary: 'Get a single booking by reference' })
    async findOne(
        @CurrentUser() user: AuthenticatedUser,
        @Param('reference') reference: string
    ): Promise<{ data: BookingResponse }> {
        const data = await this.dashboardBookingsService.findOne(user.companyId, reference)
        return { data }
    }

    @Patch(':reference')
    @ApiOperation({ summary: 'Update passenger info on a booking' })
    async update(
        @CurrentUser() user: AuthenticatedUser,
        @Param('reference') reference: string,
        @Body() dto: UpdateBookingDto
    ): Promise<{ data: BookingResponse }> {
        const data = await this.dashboardBookingsService.update(user.companyId, reference, dto)
        return { data }
    }

    @Post(':reference/cancel')
    @ApiOperation({ summary: 'Cancel a single booking' })
    async cancel(
        @CurrentUser() user: AuthenticatedUser,
        @Param('reference') reference: string
    ): Promise<{ data: BookingResponse }> {
        const data = await this.dashboardBookingsService.cancel(user.companyId, reference)
        return { data }
    }

    @Post(':reference/reactivate')
    @ApiOperation({ summary: 'Reactivate a cancelled booking (re-checks seat availability)' })
    async reactivate(
        @CurrentUser() user: AuthenticatedUser,
        @Param('reference') reference: string
    ): Promise<{ data: BookingResponse }> {
        const data = await this.dashboardBookingsService.reactivate(user.companyId, reference)
        return { data }
    }

    @Post(':reference/email')
    @HttpCode(204)
    @ApiOperation({ summary: 'Email the ticket for a booking' })
    async email(@CurrentUser() user: AuthenticatedUser, @Param('reference') reference: string): Promise<void> {
        await this.dashboardBookingsService.emailTicket(user.companyId, reference)
    }
}
