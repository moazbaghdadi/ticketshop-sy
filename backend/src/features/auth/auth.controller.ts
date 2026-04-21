import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import {
    ApiBearerAuth,
    ApiGoneResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AuthService, AuthSession, InvitationSummary } from './auth.service'
import type { AuthenticatedUser } from './decorators/current-user.decorator'
import { CurrentUser } from './decorators/current-user.decorator'
import { AcceptInvitationDto } from './dto/accept-invitation.dto'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('login')
    @ApiOperation({ summary: 'Log in with email + password' })
    @ApiOkResponse({ description: 'Session issued' })
    @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
    async login(@Body() dto: LoginDto): Promise<{ data: AuthSession }> {
        return { data: await this.authService.login(dto) }
    }

    @Get('invitations/:token')
    @ApiOperation({ summary: 'Get metadata for an invitation token' })
    @ApiNotFoundResponse({ description: 'Invitation not found' })
    @ApiGoneResponse({ description: 'Invitation expired or already accepted' })
    async getInvitation(@Param('token') token: string): Promise<{ data: InvitationSummary }> {
        return { data: await this.authService.getInvitation(token) }
    }

    @Post('invitations/:token/accept')
    @ApiOperation({ summary: 'Accept an invitation by setting a password' })
    async acceptInvitation(@Param('token') token: string, @Body() dto: AcceptInvitationDto): Promise<{ data: AuthSession }> {
        return { data: await this.authService.acceptInvitation(token, dto) }
    }

    @Get('me')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Current user profile' })
    async me(@CurrentUser() user: AuthenticatedUser): Promise<{ data: AuthenticatedUser }> {
        const full = await this.authService.getById(user.id)
        return {
            data: {
                id: full.id,
                email: full.email,
                companyId: full.companyId,
                role: full.role,
            },
        }
    }
}
