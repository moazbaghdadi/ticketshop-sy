import { Controller, Get, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Trip } from '@ticketshop-sy/shared-models'
import { SearchTripsDto } from './dto/search-trips.dto'
import { TripsService } from './trips.service'

interface TripsResponse {
    data: Trip[]
}

@ApiTags('trips')
@Controller('trips')
export class TripsController {
    constructor(private readonly tripsService: TripsService) {}

    @Get()
    @ApiOperation({ summary: 'Search available trips by route and date' })
    @ApiOkResponse({ description: 'List of trips matching the search criteria' })
    async searchTrips(@Query() query: SearchTripsDto): Promise<TripsResponse> {
        const trips = await this.tripsService.searchTrips(query.fromCityId, query.toCityId, query.date)
        return { data: trips }
    }
}
