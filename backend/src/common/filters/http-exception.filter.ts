import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { Request, Response } from 'express'
import { summarizeForLog } from '../util/log-redact'

interface ErrorResponseBody {
    statusCode: number
    message: string | string[]
    error: string
    timestamp: string
    [extra: string]: unknown
}

const STANDARD_KEYS = new Set(['statusCode', 'message', 'error', 'timestamp'])

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
        let extras: Record<string, unknown> | undefined

        if (exception instanceof HttpException) {
            status = exception.getStatus()
            const exceptionResponse = exception.getResponse()
            if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const resp = exceptionResponse as Record<string, unknown>
                message = (resp['message'] as string | string[]) ?? exception.message
                error = (resp['error'] as string) ?? exception.name
                // Preserve any extra fields the thrower attached to the exception payload (e.g.
                // ConflictException carrying upcomingTripCount + sampleTripDates) — drops would
                // erase actionable info the client needs to recover.
                for (const [k, v] of Object.entries(resp)) {
                    if (!STANDARD_KEYS.has(k)) {
                        extras = extras ?? {}
                        extras[k] = v
                    }
                }
            } else {
                message = exception.message
            }
        } else {
            // Unknown / non-HTTP errors collapse to a generic 500 in the client response — log
            // the real cause + redacted body so they don't disappear silently in production.
            const err = exception instanceof Error ? exception : new Error(String(exception))
            const body = JSON.stringify(summarizeForLog(request.body))
            this.logger.error(`Unhandled ${request.method} ${request.url} body=${body}: ${err.message}`, err.stack)
        }

        const body: ErrorResponseBody = {
            statusCode: status,
            message,
            error,
            timestamp: new Date().toISOString(),
            ...(extras ?? {}),
        }

        response.status(status).json(body)
    }
}
