import { Type } from 'class-transformer'
import {
    ArrayMinSize,
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'

export class SeatSelectionDto {
    @IsInt()
    @Min(1)
    @Max(40)
    seatId!: number

    @IsIn(['male', 'female'])
    gender!: 'male' | 'female'
}

export class PassengerInfoDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name!: string

    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    @Matches(/^\+?[0-9 -]{6,30}$/, { message: 'phone must be a valid phone number' })
    phone!: string

    @IsOptional()
    @IsEmail()
    @MaxLength(180)
    email?: string | null
}

export class CreateBookingDto {
    @IsUUID()
    @IsNotEmpty()
    tripId!: string

    @ValidateNested({ each: true })
    @Type(() => SeatSelectionDto)
    @ArrayMinSize(1)
    seatSelections!: SeatSelectionDto[]

    @IsString()
    @IsIn(['sham-cash', 'syriatel-cash'])
    paymentMethod!: 'sham-cash' | 'syriatel-cash'

    @IsString()
    @IsNotEmpty()
    boardingStationId!: string

    @IsString()
    @IsNotEmpty()
    dropoffStationId!: string

    @ValidateNested()
    @Type(() => PassengerInfoDto)
    passenger!: PassengerInfoDto
}
