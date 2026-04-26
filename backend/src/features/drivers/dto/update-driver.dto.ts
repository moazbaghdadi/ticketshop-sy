import { IsString, MaxLength, MinLength } from 'class-validator'

export class UpdateDriverDto {
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    nameAr!: string
}
