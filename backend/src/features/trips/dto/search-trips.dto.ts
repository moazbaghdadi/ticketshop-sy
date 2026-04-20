import { IsDateString, IsIn, IsNotEmpty } from 'class-validator'
import { CITY_IDS } from '../../../common/data/cities.data'

export class SearchTripsDto {
    @IsNotEmpty()
    @IsIn(CITY_IDS)
    fromCityId!: string

    @IsNotEmpty()
    @IsIn(CITY_IDS)
    toCityId!: string

    @IsNotEmpty()
    @IsDateString()
    date!: string
}
