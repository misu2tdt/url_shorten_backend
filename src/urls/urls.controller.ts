import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { UrlsService } from './urls.service';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { UpdateUrlDto } from './dto/update-url.dto';

@Controller('urls')
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) {}

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('shorten')
  shorten(@Body() dto: ShortenUrlDto) {
    return this.urlsService.shortenUrl(dto);
  }

  @Get()
  getAllUrls(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.urlsService.getAllUrls(page, limit);
  }

  @Get(':shortCode/stats')
  getUrlStats(@Param('shortCode') shortCode: string) {
    return this.urlsService.getUrlStats(shortCode);
  }

  @Throttle({ default: { ttl: 60000, limit: 200 } })
  @Get(':shortCode')
  async redirect(
    @Param('shortCode') shortCode: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const trackingData = {
      ip:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        undefined,
      userAgent: req.headers['user-agent'] || undefined,
      referrer: req.headers['referer'] as string | undefined,
    };

    const originalUrl = await this.urlsService.getOriginalUrl(
      shortCode,
      trackingData,
    );

    return res.redirect(302, originalUrl);
  }

  @Patch(':shortCode')
  updateUrl(
    @Param('shortCode') shortCode: string,
    @Body() dto: UpdateUrlDto,
  ) {
    return this.urlsService.updateUrl(shortCode, dto);
  }

  @Delete(':shortCode')
  deleteUrl(@Param('shortCode') shortCode: string) {
    return this.urlsService.deleteUrl(shortCode);
  }
}