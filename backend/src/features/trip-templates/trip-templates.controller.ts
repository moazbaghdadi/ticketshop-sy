import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CreateTripTemplateDto } from './dto/create-trip-template.dto'
import { InstantiateTemplateDto } from './dto/instantiate-template.dto'
import { TripTemplateDto, TripTemplatesService } from './trip-templates.service'

@ApiTags('dashboard-trip-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('dashboard/trip-templates')
export class TripTemplatesController {
    constructor(private readonly service: TripTemplatesService) {}

    @Get()
    @ApiOperation({ summary: 'List the company’s trip templates' })
    @ApiForbiddenResponse({ description: 'Requires admin role' })
    async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: TripTemplateDto[] }> {
        const data = await this.service.list(user.companyId)
        return { data }
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get one trip template' })
    async get(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string
    ): Promise<{ data: TripTemplateDto }> {
        const data = await this.service.get(user.companyId, id)
        return { data }
    }

    @Post()
    @ApiOperation({ summary: 'Create a trip template' })
    async create(
        @CurrentUser() user: AuthenticatedUser,
        @Body() dto: CreateTripTemplateDto
    ): Promise<{ data: TripTemplateDto }> {
        const data = await this.service.create(user.companyId, dto)
        return { data }
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a trip template (full replace of stations + prices)' })
    async update(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateTripTemplateDto
    ): Promise<{ data: TripTemplateDto }> {
        const data = await this.service.update(user.companyId, id, dto)
        return { data }
    }

    @Delete(':id')
    @HttpCode(204)
    @ApiOperation({ summary: 'Delete a trip template (does not affect trips already cloned from it)' })
    async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
        await this.service.remove(user.companyId, id)
    }

    @Post(':id/instantiate')
    @ApiOperation({
        summary: 'Clone the template into a fresh trip; only date + first-departure time are required',
    })
    async instantiate(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: InstantiateTemplateDto
    ): Promise<{ data: { id: string } }> {
        const data = await this.service.instantiate(user.companyId, id, dto.date, dto.firstDepartureTime)
        return { data }
    }
}
