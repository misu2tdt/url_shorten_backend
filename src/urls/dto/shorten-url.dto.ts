// src/urls/dto/shorten-url.dto.ts

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

export class ShortenUrlDto {
  @IsNotEmpty({ message: 'URL không được để trống' })
  @IsUrl({}, { message: 'Phải là URL hợp lệ (vd: https://google.com)' })
  originalUrl!: string;
  @IsString()
  @MinLength(3, { message: 'Alias tối thiểu 3 ký tự' })
  @MaxLength(30, { message: 'Alias tối đa 30 ký tự' })
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Alias chỉ chứa chữ cái, số, và dấu gạch ngang',
  })
  customAlias?: string;
  @IsOptional()
  @IsInt({ message: 'expiresIn phải là số nguyên (phút)' })
  @Min(1, { message: 'Tối thiểu 1 phút' })
  @Max(525600, { message: 'Tối đa 365 ngày' })
  expiresIn?: number;
}