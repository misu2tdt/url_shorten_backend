// src/urls/dto/shorten-url.dto.ts

import { IsUrl, IsNotEmpty } from 'class-validator';

export class ShortenUrlDto {
  @IsNotEmpty({ message: 'Đường dẫn không được để trống!' })
  @IsUrl({}, { message: 'Định dạng không hợp lệ. Phải là một URL (vd: https://google.com)' })
  originalUrl: string;
}