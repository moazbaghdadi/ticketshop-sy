import { Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { BookingsSeederService } from './bookings-seeder.service'
import { CompaniesSeederService } from './companies-seeder.service'
import { TripsSeederService } from './trips-seeder.service'

@Injectable()
export class SeederService {
    private readonly logger = new Logger(SeederService.name)

    constructor(
        private readonly companiesSeeder: CompaniesSeederService,
        private readonly tripsSeeder: TripsSeederService,
        private readonly bookingsSeeder: BookingsSeederService,
        private readonly dataSource: DataSource
    ) {}

    async seed(): Promise<void> {
        this.logger.log('Starting database seed...')

        this.logger.log('Wiping previous trips and bookings...')
        await this.dataSource.query('TRUNCATE TABLE "bookings", "trips" RESTART IDENTITY CASCADE')

        const companies = await this.companiesSeeder.seed()
        this.logger.log(`Seeded ${companies.length} companies`)

        const tripCount = await this.tripsSeeder.seed(companies)
        this.logger.log(`Seeded ${tripCount} trips`)

        const bookingCount = await this.bookingsSeeder.seed()
        this.logger.log(`Seeded ${bookingCount} mock bookings`)

        this.logger.log('Database seed complete.')
    }
}
