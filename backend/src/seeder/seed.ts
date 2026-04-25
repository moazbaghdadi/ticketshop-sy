import { NestFactory } from '@nestjs/core'
import { ensureRoleColumnBackfilled } from '../common/bootstrap/ensure-role-column'
import { SeederModule } from './seeder.module'
import { SeederService } from './seeder.service'

async function bootstrap(): Promise<void> {
    await ensureRoleColumnBackfilled()
    const app = await NestFactory.createApplicationContext(SeederModule)
    const seeder = app.get(SeederService)
    await seeder.seed()
    await app.close()
}

void bootstrap()
