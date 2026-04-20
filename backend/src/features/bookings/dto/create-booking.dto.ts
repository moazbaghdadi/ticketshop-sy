import { Type } from 'class-transformer'
import { ArrayMinSize, IsIn, IsInt, IsNotEmpty, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator'

export class SeatSelectionDto {
    @IsInt()
    @Min(1)
    @Max(40)
    seatId!: number

    @IsIn(['male', 'female'])
    gender!: 'male' | 'female'
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
}
