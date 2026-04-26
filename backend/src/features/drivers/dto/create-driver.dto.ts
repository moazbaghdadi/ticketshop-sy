import { IsString, MaxLength, MinLength } from 'class-validator'

export class CreateDriverDto {
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    nameAr!: string
}
