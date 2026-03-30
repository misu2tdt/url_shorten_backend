// src/urls/urls.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { ShortenUrlDto } from './dto/shorten-url.dto';

@Controller('urls') // (1) Định tuyến cha
export class UrlsController {
  
  // (2) Dependency Injection (Tiêm phụ thuộc)
  constructor(private readonly urlsService: UrlsService) {}

  @Post('shorten') // (3) Định tuyến con
  shorten(@Body() body: ShortenUrlDto) { // (4) Hứng dữ liệu
    // Lễ tân nhận được link dài, ném sang cho phòng Service xử lý
    return this.urlsService.shortenUrl(body.originalUrl);
  }
}