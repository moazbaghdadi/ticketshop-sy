import { IsDateString, IsEmail, IsString } from 'class-validator'

export class EmailReportDto {
    @IsDateString()
    from!: string

    @IsDateString()
    to!: string

    @IsString()
    @IsEmail()
    recipient!: string
}
