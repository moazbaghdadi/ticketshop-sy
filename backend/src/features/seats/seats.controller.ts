import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
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
    async getSeats(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<SeatsResponse> {
        const seats = await this.seatsService.getSeatsForTrip(tripId)
        return { data: seats }
    }
}
