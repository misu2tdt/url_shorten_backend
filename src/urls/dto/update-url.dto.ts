import { IsUrl, IsOptional, IsInt, Min, Max } from 'class-validator';

export class UpdateUrlDto {
  @IsOptional()
  @IsUrl({}, { message: 'Must be a valid URL' })
  originalUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525600)
  expiresIn?: number;
}
