import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { Request, Response } from 'express'

interface ErrorResponseBody {
    statusCode: number
    message: string | string[]
    error: string
    timestamp: string
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name)

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp()
        const response = ctx.getResponse<Response>()
        const request = ctx.getRequest<Request>()

        let status = HttpStatus.INTERNAL_SERVER_ERROR
        let message: string | string[] = 'Internal server error'
        let error = 'Internal Server Error'

        if (exception instanceof HttpException) {
            status = exception.getStatus()
            const exceptionResponse = exception.getResponse()
            if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const resp = exceptionResponse as Record<string, unknown>
                message = (resp['message'] as string | string[]) ?? exception.message
                error = (resp['error'] as string) ?? exception.name
            } else {
                message = exception.message
            }
        } else {
            // Unknown / non-HTTP errors collapse to a generic 500 in the client response — log
            // the real cause so they don't disappear silently in production.
            const err = exception instanceof Error ? exception : new Error(String(exception))
            this.logger.error(`Unhandled ${request.method} ${request.url}: ${err.message}`, err.stack)
        }

        const body: ErrorResponseBody = {
            statusCode: status,
            message,
            error,
            timestamp: new Date().toISOString(),
        }

        response.status(status).json(body)
    }
}
