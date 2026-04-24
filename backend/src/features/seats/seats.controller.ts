import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Seat } from '@ticketshop-sy/shared-models'
import { SeatsService } from './seats.service'

interface SeatsResponse {
    data: Seat[]
}

@ApiTags('seats')
@Controller('trips/:tripId/seats')
export class SeatsController {
    constructor(private readonly seatsService: SeatsService) {}

    @Get()
    @ApiOperation({ summary: 'Get seat layout for a trip' })
    @ApiOkResponse({ description: 'Seat layout with occupancy status' })
    @ApiNotFoundResponse({ description: 'Trip not found' })
    @ApiQuery({ name: 'boardingStationId', required: false })
    @ApiQuery({ name: 'dropoffStationId', required: false })
    async getSeats(
        @Param('tripId', ParseUUIDPipe) tripId: string,
        @Query('boardingStationId') boardingStationId?: string,
        @Query('dropoffStationId') dropoffStationId?: string
    ): Promise<SeatsResponse> {
        const seats = await this.seatsService.getSeatsForTrip(tripId, { boardingStationId, dropoffStationId })
        return { data: seats }
    }
}
