import { Type } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator'

export class UpdatePassengerDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name?: string

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    @Matches(/^\+?[0-9 -]{6,30}$/, { message: 'phone must be a valid phone number' })
    phone?: string

    @IsOptional()
    @IsEmail()
    @MaxLength(180)
    email?: string | null
}

export class UpdateBookingDto {
    @ValidateNested()
    @Type(() => UpdatePassengerDto)
    passenger!: UpdatePassengerDto
}
