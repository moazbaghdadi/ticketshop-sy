import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { DashboardTripDetail, DashboardTripListResult, DashboardTripsService } from './dashboard-trips.service'
import { CancelTripDto } from './dto/cancel-trip.dto'
import { CreateDashboardTripDto } from './dto/create-dashboard-trip.dto'

@ApiTags('dashboard-trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard/trips')
export class DashboardTripsController {
    constructor(private readonly dashboardTripsService: DashboardTripsService) {}

    @Get()
    @ApiOperation({ summary: 'List trips for the current user’s company' })
    @ApiQuery({ name: 'date', required: false, description: 'Filter by trip date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number (1-indexed)' })
    async list(
        @CurrentUser() user: AuthenticatedUser,
        @Query('date') date?: string,
        @Query('page') page?: string
    ): Promise<{ data: DashboardTripListResult }> {
        const parsedPage = page ? Number(page) : 1
        const data = await this.dashboardTripsService.listTrips(user.companyId, {
            date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
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
