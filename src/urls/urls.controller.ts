// src/urls/urls.controller.ts
import { Controller, Post, Body, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express'; 
import { UrlsService } from './urls.service';
import { ShortenUrlDto } from './dto/shorten-url.dto';

@Controller('urls') 
export class UrlsController {
  
  // (2) Dependency Injection (Tiêm phụ thuộc)
  constructor(private readonly urlsService: UrlsService) {}

  @Post('shorten') 
  shorten(@Body() body: ShortenUrlDto) { 
    return this.urlsService.shortenUrl(body.originalUrl);
  }

  @Get(':shortCode') 
  // 1. Phải có chữ async ở trước tên hàm
  async redirectUrl(@Param('shortCode') shortCode: string, @Res() res: Response) {
    
    // 2. Phải có chữ await ở đây để "đứng đợi" ông Service xuống DB lấy link lên
    const originalUrl = await this.urlsService.getOriginalUrl(shortCode);
    
    // 3. Lúc này originalUrl đã là cái link thật, đưa cho redirect là chạy mượt mà
    return res.redirect(302, originalUrl);
  
  }

}