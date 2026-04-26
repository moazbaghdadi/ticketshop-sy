import { Type } from 'class-transformer'
import { ArrayMinSize, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'

export class TripTemplateStationDto {
    @IsString()
    cityId!: string

    @IsInt()
    @Min(0)
    order!: number

    @IsInt()
    @Min(0)
    arrivalOffsetMin!: number

    @IsInt()
    @Min(0)
    departureOffsetMin!: number
}

export class TripTemplateSegmentPriceDto {
    @IsString()
    fromCityId!: string

    @IsString()
    toCityId!: string

    @IsInt()
    @Min(1)
    price!: number
}

export class TripTemplateDriverDto {
    @IsOptional()
    @IsUUID()
    id?: string

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string
}

export class CreateTripTemplateDto {
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    nameAr!: string

    @ValidateNested()
    @Type(() => TripTemplateDriverDto)
    driver!: TripTemplateDriverDto

    @ValidateNested({ each: true })
    @Type(() => TripTemplateStationDto)
    @ArrayMinSize(2)
    stations!: TripTemplateStationDto[]

    @ValidateNested({ each: true })
    @Type(() => TripTemplateSegmentPriceDto)
    @ArrayMinSize(1)
    segmentPrices!: TripTemplateSegmentPriceDto[]
}
