import { Logger } from '@nestjs/common'
import { EmailService } from './email.service'

describe('EmailService', () => {
    let service: EmailService
    let logSpy: jest.SpyInstance

    beforeEach(() => {
        service = new EmailService()
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('logs the recipient and subject when sending', async () => {
        await service.send({ to: 'user@example.com', subject: 'Hello', body: 'A body' })

        expect(logSpy).toHaveBeenCalledTimes(1)
        const line = logSpy.mock.calls[0]![0] as string
        expect(line).toContain('to=user@example.com')
        expect(line).toContain('subject="Hello"')
        expect(line).toContain('bodyLength=6')
    })
})
