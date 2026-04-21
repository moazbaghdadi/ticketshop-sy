import { IsString, MaxLength, MinLength } from 'class-validator'

export class AcceptInvitationDto {
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    password!: string
}
