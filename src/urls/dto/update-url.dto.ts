import { IsUrl, IsOptional, IsInt, Min, Max } from 'class-validator';

export class UpdateUrlDto {
  @IsOptional()
  @IsUrl({}, { message: 'Phải là URL hợp lệ' })
  originalUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525600)
  expiresIn?: number;
}