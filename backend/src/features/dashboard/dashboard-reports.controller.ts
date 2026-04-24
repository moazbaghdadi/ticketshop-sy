import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { DashboardReport, DashboardReportsService } from './dashboard-reports.service'
import { EmailReportDto } from './dto/email-report.dto'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

@ApiTags('dashboard-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard/reports')
export class DashboardReportsController {
    constructor(private readonly reportsService: DashboardReportsService) {}

    @Get()
    @ApiOperation({ summary: 'Sales report aggregated by day and route for a date range' })
    @ApiQuery({ name: 'from', description: 'Inclusive start date (YYYY-MM-DD)' })
    @ApiQuery({ name: 'to', description: 'Inclusive end date (YYYY-MM-DD)' })
    async get(
        @CurrentUser() user: AuthenticatedUser,
        @Query('from') from?: string,
        @Query('to') to?: string
    ): Promise<{ data: DashboardReport }> {
        if (!from || !to || !DATE_REGEX.test(from) || !DATE_REGEX.test(to)) {
            throw new BadRequestException('from and to must be YYYY-MM-DD')
        }
        const data = await this.reportsService.generate(user.companyId, from, to)
        return { data }
    }

    @Post('email')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @HttpCode(204)
    @ApiOperation({ summary: 'Send the report for a date range to an email recipient' })
    @ApiForbiddenResponse({ description: 'Requires admin role' })
    async email(@CurrentUser() user: AuthenticatedUser, @Body() dto: EmailReportDto): Promise<void> {
        await this.reportsService.emailReport(user.companyId, dto.from, dto.to, dto.recipient)
    }
}
