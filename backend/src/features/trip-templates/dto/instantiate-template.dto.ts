import { IsDateString, IsString, Matches } from 'class-validator'

const HM_REGEX = /^\d{2}:\d{2}$/

export class InstantiateTemplateDto {
    @IsDateString()
    date!: string

    @IsString()
    @Matches(HM_REGEX, { message: 'firstDepartureTime must be HH:mm' })
    firstDepartureTime!: string
}
