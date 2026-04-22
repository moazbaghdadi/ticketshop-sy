import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BookingResponse } from '@ticketshop-sy/shared-models'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CreateBookingDto } from '../bookings/dto/create-booking.dto'
import { DashboardBookingsService } from './dashboard-bookings.service'

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

    @Post(':reference/email')
    @HttpCode(204)
    @ApiOperation({ summary: 'Email the ticket for a booking' })
    async email(@CurrentUser() user: AuthenticatedUser, @Param('reference') reference: string): Promise<void> {
        await this.dashboardBookingsService.emailTicket(user.companyId, reference)
    }
}
