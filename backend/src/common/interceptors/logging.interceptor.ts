import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Request, Response } from 'express'
import { Observable, tap } from 'rxjs'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('Http')

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') return next.handle()

        const ctx = context.switchToHttp()
        const request = ctx.getRequest<Request>()
        const response = ctx.getResponse<Response>()
        const startedAt = Date.now()
        const tag = `${request.method} ${request.originalUrl ?? request.url}`

        this.logger.log(`[req] ${tag}`)

        return next.handle().pipe(
            tap({
                next: () => {
                    this.logger.log(`[res] ${tag} ${response.statusCode} ${Date.now() - startedAt}ms`)
                },
                error: () => {
                    // The exception filter sets the final status code + logs the cause.
                    // Here we just emit the duration so [req]/[res] always come in pairs.
                    this.logger.warn(`[res] ${tag} errored after ${Date.now() - startedAt}ms`)
                },
            })
        )
    }
}
