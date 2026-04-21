import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class CancelTripDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    reason!: string
}
