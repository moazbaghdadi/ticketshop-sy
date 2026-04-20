import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import {
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOperation,
    ApiTags,
    ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { BookingResponse } from '@ticketshop-sy/shared-models'
import { BookingsService } from './bookings.service'
import { CreateBookingDto } from './dto/create-booking.dto'

interface BookingDataResponse {
    data: BookingResponse
}

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
    constructor(private readonly bookingsService: BookingsService) {}

    @Post()
    @ApiOperation({ summary: 'Create a new booking' })
    @ApiCreatedResponse({ description: 'Booking created successfully' })
    @ApiNotFoundResponse({ description: 'Trip not found' })
    @ApiConflictResponse({ description: 'One or more seats are already occupied' })
    @ApiUnprocessableEntityResponse({ description: 'Gender constraint violation' })
    async createBooking(@Body() dto: CreateBookingDto): Promise<BookingDataResponse> {
        const booking = await this.bookingsService.createBooking(dto)
        return { data: booking }
    }

    @Get(':reference')
    @ApiOperation({ summary: 'Get booking by reference' })
    @ApiNotFoundResponse({ description: 'Booking not found' })
    async getBooking(@Param('reference') reference: string): Promise<BookingDataResponse> {
        const booking = await this.bookingsService.findByReference(reference)
        return { data: booking }
    }
}
