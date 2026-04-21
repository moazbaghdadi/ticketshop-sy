import { ConflictException, GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { Repository } from 'typeorm'
import { CompanyEntity } from '../companies/entities/company.entity'
import { AuthenticatedUser } from './decorators/current-user.decorator'
import { AcceptInvitationDto } from './dto/accept-invitation.dto'
import { LoginDto } from './dto/login.dto'
import { InvitationEntity } from './entities/invitation.entity'
import { UserEntity } from './entities/user.entity'
import { JwtPayload } from './jwt.strategy'

const BCRYPT_ROUNDS = 12
const INVITATION_TOKEN_BYTES = 32
const INVITATION_TTL_DAYS = 7

export interface AuthSession {
    accessToken: string
    user: { id: string; email: string; companyId: string; role: UserEntity['role'] }
}

export interface InvitationSummary {
    email: string
    companyName: string
}

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        @InjectRepository(InvitationEntity)
        private readonly invitationRepository: Repository<InvitationEntity>,
        @InjectRepository(CompanyEntity)
        private readonly companyRepository: Repository<CompanyEntity>,
        private readonly jwtService: JwtService
    ) {}

    async login(dto: LoginDto): Promise<AuthSession> {
        const user = await this.userRepository.findOne({ where: { email: dto.email.toLowerCase() } })
        if (!user || !user.passwordHash) {
            throw new UnauthorizedException('Invalid credentials')
        }
        const ok = await bcrypt.compare(dto.password, user.passwordHash)
        if (!ok) {
            throw new UnauthorizedException('Invalid credentials')
        }
        return this.issueSession(user)
    }

    async createInvitation(email: string, companyId: string): Promise<InvitationEntity> {
        const company = await this.companyRepository.findOneBy({ id: companyId })
        if (!company) {
            throw new NotFoundException(`Company ${companyId} not found`)
        }
        const normalizedEmail = email.toLowerCase()
        const existingUser = await this.userRepository.findOneBy({ email: normalizedEmail })
        if (existingUser) {
            throw new ConflictException(`A user already exists for ${normalizedEmail}`)
        }
        const token = randomBytes(INVITATION_TOKEN_BYTES).toString('hex')
        const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
        const invitation = this.invitationRepository.create({
            token,
            email: normalizedEmail,
            companyId,
            expiresAt,
            acceptedAt: null,
        })
        return this.invitationRepository.save(invitation)
    }

    async getInvitation(token: string): Promise<InvitationSummary> {
        const invitation = await this.loadValidInvitation(token)
        return { email: invitation.email, companyName: invitation.company.nameAr }
    }

    async acceptInvitation(token: string, dto: AcceptInvitationDto): Promise<AuthSession> {
        const invitation = await this.loadValidInvitation(token)
        const existing = await this.userRepository.findOneBy({ email: invitation.email })
        if (existing) {
            throw new ConflictException(`A user already exists for ${invitation.email}`)
        }
        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
        const user = await this.userRepository.save(
            this.userRepository.create({
                email: invitation.email,
                passwordHash,
                companyId: invitation.companyId,
                role: 'agent',
            })
        )
        invitation.acceptedAt = new Date()
        await this.invitationRepository.save(invitation)
        return this.issueSession(user)
    }

    async getById(userId: string): Promise<UserEntity> {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            relations: { company: true },
        })
        if (!user) {
            throw new UnauthorizedException()
        }
        return user
    }

    private async loadValidInvitation(token: string): Promise<InvitationEntity> {
        const invitation = await this.invitationRepository.findOne({
            where: { token },
            relations: { company: true },
        })
        if (!invitation) {
            throw new NotFoundException('Invitation not found')
        }
        if (invitation.acceptedAt) {
            throw new GoneException('Invitation has already been accepted')
        }
        if (invitation.expiresAt.getTime() < Date.now()) {
            throw new GoneException('Invitation has expired')
        }
        return invitation
    }

    private issueSession(user: UserEntity): AuthSession {
        const payload: JwtPayload = {
            sub: user.id,
            email: user.email,
            companyId: user.companyId,
            role: user.role,
        }
        const accessToken = this.jwtService.sign(payload)
        const authUser: AuthenticatedUser = {
            id: user.id,
            email: user.email,
            companyId: user.companyId,
            role: user.role,
        }
        return { accessToken, user: authUser }
    }
}
