// src/urls/urls.controller.ts
import { Controller, Post, Body, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express'; // <-- Chính là dòng cứu mạng này
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

  @Get(':shortCode') 
  redirectUrl(@Param('shortCode') shortCode: string, @Res() res: Response) {
    // 1. Nhờ Service tìm link gốc
    const originalUrl = this.urlsService.getOriginalUrl(shortCode);
    
    // 2. Ép trình duyệt chuyển hướng (Mã 302) sang link gốc
    return res.redirect(302, originalUrl);
  }

}