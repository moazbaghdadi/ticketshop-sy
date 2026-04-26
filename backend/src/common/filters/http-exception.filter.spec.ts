import { ArgumentsHost, BadRequestException, ConflictException, Logger } from '@nestjs/common'
import { GlobalExceptionFilter } from './http-exception.filter'

interface MockResponse {
    status: jest.Mock
    json: jest.Mock
    statusCode?: number
}

function makeHost(method: string, url: string, body: unknown, response: MockResponse): ArgumentsHost {
    const httpCtx = {
        getResponse: () => response,
        getRequest: () => ({ method, url, body }),
    }
    return {
        switchToHttp: () => httpCtx,
    } as unknown as ArgumentsHost
}

function makeResponse(): MockResponse {
    const res: MockResponse = {
        status: jest.fn(),
        json: jest.fn(),
    }
    res.status.mockReturnValue(res)
    res.json.mockReturnValue(res)
    return res
}

describe('GlobalExceptionFilter', () => {
    let filter: GlobalExceptionFilter
    let errorSpy: jest.SpyInstance

    beforeEach(() => {
        filter = new GlobalExceptionFilter()
        errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        errorSpy.mockRestore()
    })

    it('logs unknown errors with stack + redacted body and responds 500', () => {
        const response = makeResponse()
        const body = {
            tripId: 'trip-uuid',
            passenger: { name: 'علا كامل', phone: '0945215415' },
        }
        const host = makeHost('POST', '/api/v1/bookings', body, response)
        const error = new Error('boom from postgres')

        filter.catch(error, host)

        expect(response.status).toHaveBeenCalledWith(500)
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' })
        )
        expect(errorSpy).toHaveBeenCalledTimes(1)

        const [logLine, logStack] = errorSpy.mock.calls[0]
        expect(logLine).toContain('POST /api/v1/bookings')
        expect(logLine).toContain('boom from postgres')
        expect(logLine).toContain('"tripId":"trip-uuid"')
        // Passenger PII must be redacted, not echoed.
        expect(logLine).toContain('"passenger":"<redacted>"')
        expect(logLine).not.toContain('علا كامل')
        expect(logLine).not.toContain('0945215415')
        expect(logStack).toBe(error.stack)
    })

    it('does not log via Logger.error for plain HttpExceptions (validation, 4xx, etc.)', () => {
        const response = makeResponse()
        const host = makeHost('POST', '/api/v1/bookings', {}, response)

        filter.catch(new BadRequestException('invalid'), host)

        expect(response.status).toHaveBeenCalledWith(400)
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('forwards extra object fields from HttpException payload (e.g. conflict info)', () => {
        const response = makeResponse()
        const host = makeHost('DELETE', '/api/v1/dashboard/drivers/d-1', {}, response)

        filter.catch(
            new ConflictException({
                message: 'Driver assigned to upcoming trips',
                upcomingTripCount: 3,
                sampleTripDates: ['2030-01-01', '2030-01-02'],
            }),
            host
        )

        expect(response.status).toHaveBeenCalledWith(409)
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 409,
                message: 'Driver assigned to upcoming trips',
                upcomingTripCount: 3,
                sampleTripDates: ['2030-01-01', '2030-01-02'],
            })
        )
    })
})
