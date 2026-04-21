import { Injectable, Logger } from '@nestjs/common'
import { BookingsSeederService } from './bookings-seeder.service'
import { CompaniesSeederService } from './companies-seeder.service'
import { TripsSeederService } from './trips-seeder.service'

@Injectable()
export class SeederService {
    private readonly logger = new Logger(SeederService.name)

    constructor(
        private readonly companiesSeeder: CompaniesSeederService,
        private readonly tripsSeeder: TripsSeederService,
        private readonly bookingsSeeder: BookingsSeederService
    ) {}

    async seed(): Promise<void> {
        this.logger.log('Starting database seed...')

        const companies = await this.companiesSeeder.seed()
        this.logger.log(`Seeded ${companies.length} companies`)

        const tripCount = await this.tripsSeeder.seed(companies)
        this.logger.log(`Seeded ${tripCount} trips`)

        const bookingCount = await this.bookingsSeeder.seed()
        this.logger.log(`Seeded ${bookingCount} mock bookings`)

        this.logger.log('Database seed complete.')
    }
}
