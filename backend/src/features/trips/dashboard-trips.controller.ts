import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { DashboardTripsService } from './dashboard-trips.service'
import { CancelTripDto } from './dto/cancel-trip.dto'
import { CreateDashboardTripDto } from './dto/create-dashboard-trip.dto'

@ApiTags('dashboard-trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard/trips')
export class DashboardTripsController {
    constructor(private readonly dashboardTripsService: DashboardTripsService) {}

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
