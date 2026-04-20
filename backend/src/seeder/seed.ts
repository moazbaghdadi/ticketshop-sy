import { NestFactory } from '@nestjs/core'
import { SeederModule } from './seeder.module'
import { SeederService } from './seeder.service'

async function bootstrap(): Promise<void> {
    const app = await NestFactory.createApplicationContext(SeederModule)
    const seeder = app.get(SeederService)
    await seeder.seed()
    await app.close()
}

void bootstrap()
