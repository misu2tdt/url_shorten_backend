import {
  IsUrl,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShortenUrlDto {
  @ApiProperty({
    example: 'https://google.com',
    description: 'The original URL to shorten',
  })
  @IsNotEmpty({ message: 'URL không được để trống' })
  @IsUrl({}, { message: 'Phải là URL hợp lệ (vd: https://google.com)' })
  originalUrl!: string;

  @ApiPropertyOptional({
    example: 'my-portfolio',
    description: 'Custom alias (3-30 chars, alphanumeric + hyphens)',
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Alias tối thiểu 3 ký tự' })
  @MaxLength(30, { message: 'Alias tối đa 30 ký tự' })
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Alias chỉ chứa chữ cái, số, và dấu gạch ngang',
  })
  customAlias?: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'Expiration time in minutes (1 - 525600)',
  })
  @IsOptional()
  @IsInt({ message: 'expiresIn phải là số nguyên (phút)' })
  @Min(1, { message: 'Tối thiểu 1 phút' })
  @Max(525600, { message: 'Tối đa 365 ngày' })
  expiresIn?: number;
}