import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { Response } from 'express'

interface ErrorResponseBody {
    statusCode: number
    message: string | string[]
    error: string
    timestamp: string
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp()
        const response = ctx.getResponse<Response>()

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
