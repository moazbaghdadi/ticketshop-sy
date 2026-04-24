import { NestFactory } from '@nestjs/core'
import { DataSource } from 'typeorm'
import { AppModule } from '../app.module'

async function main(): Promise<void> {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
    try {
        const dataSource = app.get(DataSource)
        const result = await dataSource.query("UPDATE users SET role = 'admin' WHERE role = 'agent'")
        const affected = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0
        console.log(`migrate:roles → updated ${affected} user(s) from 'agent' to 'admin'`)
    } finally {
        await app.close()
    }
}

void main()
