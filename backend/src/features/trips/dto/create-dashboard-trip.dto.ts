import { Type } from 'class-transformer'
import { ArrayMinSize, IsDateString, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator'

const HM_REGEX = /^\d{2}:\d{2}$/

export class DashboardTripStationDto {
    @IsString()
    cityId!: string

    @IsInt()
    @Min(0)
    order!: number

    @IsOptional()
    @IsString()
    @Matches(HM_REGEX, { message: 'arrivalTime must be HH:mm' })
    arrivalTime?: string | null

    @IsOptional()
    @IsString()
    @Matches(HM_REGEX, { message: 'departureTime must be HH:mm' })
    departureTime?: string | null
}

export class DashboardTripSegmentPriceDto {
    @IsString()
    fromCityId!: string

    @IsString()
    toCityId!: string

    @IsInt()
    @Min(1)
    price!: number
}

export class CreateDashboardTripDto {
    @IsDateString()
    date!: string

    @ValidateNested({ each: true })
    @Type(() => DashboardTripStationDto)
    @ArrayMinSize(2)
    stations!: DashboardTripStationDto[]

    @ValidateNested({ each: true })
    @Type(() => DashboardTripSegmentPriceDto)
    @ArrayMinSize(1)
    segmentPrices!: DashboardTripSegmentPriceDto[]
}
