import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { DashboardOverview, DashboardOverviewService } from './dashboard-overview.service'

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard/overview')
export class DashboardOverviewController {
    constructor(private readonly overviewService: DashboardOverviewService) {}

    @Get()
    @ApiOperation({ summary: 'Dashboard overview: upcoming trips, latest sales, balance, active cancellations' })
    async get(@CurrentUser() user: AuthenticatedUser): Promise<{ data: DashboardOverview }> {
        return { data: await this.overviewService.getOverview(user.id, user.companyId) }
    }
}
