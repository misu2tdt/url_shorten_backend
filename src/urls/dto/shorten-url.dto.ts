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
  @IsNotEmpty({ message: 'URL must not be empty' })
  @IsUrl({}, { message: 'Must be a valid URL (e.g. https://google.com)' })
  originalUrl!: string;

  @ApiPropertyOptional({
    example: 'my-portfolio',
    description: 'Custom alias (3-30 chars, alphanumeric + hyphens)',
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Alias must be at least 3 characters' })
  @MaxLength(30, { message: 'Alias must be at most 30 characters' })
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Alias may only contain letters, numbers, and hyphens',
  })
  customAlias?: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'Expiration time in minutes (1 - 525600)',
  })
  @IsOptional()
  @IsInt({ message: 'expiresIn must be an integer (minutes)' })
  @Min(1, { message: 'Must be at least 1 minute' })
  @Max(525600, { message: 'Must be at most 365 days' })
  expiresIn?: number;
}
