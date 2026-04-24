import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { AuthService } from '../features/auth/auth.service'
import { buildInvitationUrl, InviteCliArgsError, parseInviteArgs } from './invite.util'

async function main(): Promise<void> {
    let args
    try {
        args = parseInviteArgs(process.argv.slice(2))
    } catch (err) {
        if (err instanceof InviteCliArgsError) {
            console.error(err.message)
            console.error('Usage: npm run invite -- --email=foo@bar.com --companyId=<uuid> --role=admin|sales')
            process.exit(1)
        }
        throw err
    }

    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
    try {
        const authService = app.get(AuthService)
        const configService = app.get(ConfigService)
        const invitation = await authService.createInvitation(args.email, args.companyId, args.role)
        const baseUrl = configService.get<string>('DASHBOARD_BASE_URL', 'http://localhost:4201')
        const url = buildInvitationUrl(baseUrl, invitation.token)
        console.log(url)
    } finally {
        await app.close()
    }
}

void main()
