import { Type } from 'class-transformer'
import {
    ArrayMinSize,
    IsBoolean,
    IsDateString,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator'

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

/**
 * One of `id` (existing driver) or `name` (new driver — find-or-create) must be supplied.
 * Validation happens in the service after we know the company.
 */
export class DashboardTripDriverDto {
    @IsOptional()
    @IsUUID()
    id?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string
}

export class CreateDashboardTripDto {
    @IsDateString()
    date!: string

    @ValidateNested()
    @Type(() => DashboardTripDriverDto)
    driver!: DashboardTripDriverDto

    @ValidateNested({ each: true })
    @Type(() => DashboardTripStationDto)
    @ArrayMinSize(2)
    stations!: DashboardTripStationDto[]

    @ValidateNested({ each: true })
    @Type(() => DashboardTripSegmentPriceDto)
    @ArrayMinSize(1)
    segmentPrices!: DashboardTripSegmentPriceDto[]

    /**
     * If true, ALSO snapshot the trip into a TripTemplate at create time. Requires templateName.
     */
    @IsOptional()
    @IsBoolean()
    saveAsTemplate?: boolean

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    templateName?: string
}
