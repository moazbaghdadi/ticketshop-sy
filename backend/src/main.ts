import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule)

    const configService = app.get(ConfigService)

    app.setGlobalPrefix('api/v1')

    app.enableCors({
        origin: configService
            .get<string>('CORS_ORIGINS')
            ?.split(',')
            .map(o => o.trim()) ?? ['http://localhost:4200'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })

    app.useGlobalFilters(new GlobalExceptionFilter())

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
        })
    )

    const config = new DocumentBuilder().setTitle('Ticketshop Syria').setVersion('1.0').build()
    const documentFactory = (): OpenAPIObject => SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api', app, documentFactory())

    await app.listen(configService.get<number>('PORT') ?? 3000)
}
void bootstrap()
