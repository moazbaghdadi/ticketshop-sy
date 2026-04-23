import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import {
    DashboardTripDetail,
    DashboardTripListResult,
    DashboardTripsService,
    TripSortDir,
    TripSortField,
    TripStatusFilter,
} from './dashboard-trips.service'
import { CancelTripDto } from './dto/cancel-trip.dto'
import { CreateDashboardTripDto } from './dto/create-dashboard-trip.dto'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const STATUS_VALUES: TripStatusFilter[] = ['active', 'cancelled', 'all']
const SORT_FIELDS: TripSortField[] = ['date', 'route', 'status']
const SORT_DIRS: TripSortDir[] = ['asc', 'desc']

function validateTime(value: string | undefined, param: string): string | undefined {
    if (value === undefined) return undefined
    if (!TIME_RE.test(value)) {
        throw new BadRequestException(`${param} must be in HH:mm format`)
    }
    return value
}

function validateEnum<T extends string>(value: string | undefined, allowed: readonly T[], param: string): T | undefined {
    if (value === undefined) return undefined
    if (!(allowed as readonly string[]).includes(value)) {
        throw new BadRequestException(`${param} must be one of: ${allowed.join(', ')}`)
    }
    return value as T
}

@ApiTags('dashboard-trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard/trips')
export class DashboardTripsController {
    constructor(private readonly dashboardTripsService: DashboardTripsService) {}

    @Get()
    @ApiOperation({ summary: 'List trips for the current user’s company' })
    @ApiQuery({ name: 'date', required: false, description: 'Filter by trip date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'tripId', required: false, description: 'Fuzzy match on trip UUID (substring)' })
    @ApiQuery({ name: 'route', required: false, description: 'Fuzzy match on any station city name (Arabic)' })
    @ApiQuery({ name: 'departureFrom', required: false, description: 'Origin departure >= HH:mm' })
    @ApiQuery({ name: 'departureTo', required: false, description: 'Origin departure <= HH:mm' })
    @ApiQuery({ name: 'arrivalFrom', required: false, description: 'Terminus arrival >= HH:mm' })
    @ApiQuery({ name: 'arrivalTo', required: false, description: 'Terminus arrival <= HH:mm' })
    @ApiQuery({ name: 'status', required: false, enum: ['active', 'cancelled', 'all'] })
    @ApiQuery({ name: 'sortBy', required: false, enum: ['date', 'route', 'status'] })
    @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (1-indexed)' })
    async list(
        @CurrentUser() user: AuthenticatedUser,
        @Query('date') date?: string,
        @Query('tripId') tripId?: string,
        @Query('route') route?: string,
        @Query('departureFrom') departureFrom?: string,
        @Query('departureTo') departureTo?: string,
        @Query('arrivalFrom') arrivalFrom?: string,
        @Query('arrivalTo') arrivalTo?: string,
        @Query('status') status?: string,
        @Query('sortBy') sortBy?: string,
        @Query('sortDir') sortDir?: string,
        @Query('page') page?: string
    ): Promise<{ data: DashboardTripListResult }> {
        const parsedPage = page ? Number(page) : 1

        const validatedDate = date && DATE_RE.test(date) ? date : undefined
        const trimmedTripId = tripId?.trim() || undefined
        const trimmedRoute = route?.trim() || undefined

        const data = await this.dashboardTripsService.listTrips(user.companyId, {
            date: validatedDate,
            tripId: trimmedTripId,
            route: trimmedRoute,
            departureFrom: validateTime(departureFrom, 'departureFrom'),
            departureTo: validateTime(departureTo, 'departureTo'),
            arrivalFrom: validateTime(arrivalFrom, 'arrivalFrom'),
            arrivalTo: validateTime(arrivalTo, 'arrivalTo'),
            status: validateEnum(status, STATUS_VALUES, 'status'),
            sortBy: validateEnum(sortBy, SORT_FIELDS, 'sortBy'),
            sortDir: validateEnum(sortDir, SORT_DIRS, 'sortDir'),
            page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
        })
        return { data }
    }

    @Get(':id/bookings')
    @ApiOperation({ summary: 'Get a trip with its bookings for the current user’s company' })
    async getDetail(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) tripId: string
    ): Promise<{ data: DashboardTripDetail }> {
        const data = await this.dashboardTripsService.getTripDetail(user.companyId, tripId)
        return { data }
    }

    @Post()
    @ApiOperation({ summary: 'Create a multi-stop trip for the current user’s company' })
    async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDashboardTripDto): Promise<{ data: { id: string } }> {
        const trip = await this.dashboardTripsService.create(user.companyId, dto)
        return { data: { id: trip.id } }
    }

    @Post(':id/cancel')
    @ApiOperation({ summary: 'Cancel a trip and mark its bookings as cancelled' })
    async cancel(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) tripId: string,
        @Body() dto: CancelTripDto
    ): Promise<{ data: { id: string; cancelledAt: string; cancelledReason: string } }> {
        const trip = await this.dashboardTripsService.cancel(user.companyId, tripId, dto.reason)
        return {
            data: {
                id: trip.id,
                cancelledAt: trip.cancelledAt!.toISOString(),
                cancelledReason: trip.cancelledReason!,
            },
        }
    }

    @Post(':id/dismiss-cancellation')
    @HttpCode(204)
    @ApiOperation({ summary: 'Dismiss a cancelled-trip notification for the current user' })
    async dismiss(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) tripId: string): Promise<void> {
        await this.dashboardTripsService.dismissCancellation(user.id, user.companyId, tripId)
    }
}
