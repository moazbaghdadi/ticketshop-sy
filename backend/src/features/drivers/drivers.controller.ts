import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { DriverDto, DriversService } from './drivers.service'
import { CreateDriverDto } from './dto/create-driver.dto'
import { UpdateDriverDto } from './dto/update-driver.dto'

@ApiTags('dashboard-drivers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('dashboard/drivers')
export class DriversController {
    constructor(private readonly driversService: DriversService) {}

    @Get()
    @ApiOperation({ summary: 'List active drivers for the current user’s company' })
    @ApiQuery({ name: 'query', required: false, description: 'ILIKE substring match on nameAr (Arabic)' })
    @ApiForbiddenResponse({ description: 'Requires admin role' })
    async list(@CurrentUser() user: AuthenticatedUser, @Query('query') query?: string): Promise<{ data: DriverDto[] }> {
        const data = await this.driversService.list(user.companyId, query)
        return { data }
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get one driver' })
    async get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<{ data: DriverDto }> {
        const data = await this.driversService.get(user.companyId, id)
        return { data }
    }

    @Post()
    @ApiOperation({ summary: 'Create a driver' })
    async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDriverDto): Promise<{ data: DriverDto }> {
        const data = await this.driversService.create(user.companyId, dto.nameAr)
        return { data }
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Rename a driver' })
    async update(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateDriverDto
    ): Promise<{ data: DriverDto }> {
        const data = await this.driversService.update(user.companyId, id, dto.nameAr)
        return { data }
    }

    @Delete(':id')
    @HttpCode(204)
    @ApiOperation({
        summary: 'Soft-delete a driver. 409 if assigned to upcoming trips without replacementDriverId.',
    })
    @ApiQuery({ name: 'replacementDriverId', required: false, description: 'Driver to reassign upcoming trips to' })
    async remove(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Query('replacementDriverId') replacementDriverId?: string
    ): Promise<void> {
        await this.driversService.remove(user.companyId, id, replacementDriverId?.trim() || undefined)
    }
}
