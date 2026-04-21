import { Injectable, Logger } from '@nestjs/common'

export interface SendEmailInput {
    to: string
    subject: string
    body: string
}

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name)

    send(input: SendEmailInput): Promise<void> {
        this.logger.log(`[MAIL STUB] to=${input.to} subject="${input.subject}" bodyLength=${input.body.length}`)
        this.logger.debug(`[MAIL STUB] body=${input.body}`)
        return Promise.resolve()
    }
}
