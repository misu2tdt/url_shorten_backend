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
  redirectUrl(@Param('shortCode') shortCode: string, @Res() res: Response) {
    const originalUrl = this.urlsService.getOriginalUrl(shortCode);
    return res.redirect(302, originalUrl);
  }

}