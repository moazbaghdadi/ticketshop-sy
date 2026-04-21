import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { DashboardTripsService } from './dashboard-trips.service'
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
}
