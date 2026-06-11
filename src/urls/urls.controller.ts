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
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { UrlsService } from './urls.service';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { UpdateUrlDto } from './dto/update-url.dto';

@ApiTags('URLs')
@Controller('urls')
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) {}

  @ApiOperation({ summary: 'Create a shortened URL' })
  @ApiResponse({ status: 201, description: 'Short URL created successfully' })
  @ApiResponse({ status: 409, description: 'Custom alias already in use' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('shorten')
  shorten(@Body() dto: ShortenUrlDto) {
    return this.urlsService.shortenUrl(dto);
  }

  @ApiOperation({ summary: 'List all URLs (paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @Get()
  getAllUrls(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.urlsService.getAllUrls(page, limit);
  }

  @ApiOperation({ summary: 'Get click analytics for a URL' })
  @ApiResponse({ status: 200, description: 'Analytics data returned' })
  @ApiResponse({ status: 404, description: 'URL not found' })
  @Get(':shortCode/stats')
  getUrlStats(@Param('shortCode') shortCode: string) {
    return this.urlsService.getUrlStats(shortCode);
  }

  @ApiOperation({ summary: 'Redirect to original URL' })
  @ApiResponse({ status: 302, description: 'Redirected to original URL' })
  @ApiResponse({ status: 404, description: 'URL not found' })
  @ApiResponse({ status: 410, description: 'URL has expired' })
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

  @ApiOperation({ summary: 'Update a URL' })
  @ApiResponse({ status: 200, description: 'URL updated successfully' })
  @ApiResponse({ status: 404, description: 'URL not found' })
  @Patch(':shortCode')
  updateUrl(
    @Param('shortCode') shortCode: string,
    @Body() dto: UpdateUrlDto,
  ) {
    return this.urlsService.updateUrl(shortCode, dto);
  }

  @ApiOperation({ summary: 'Delete a URL (soft delete)' })
  @ApiResponse({ status: 200, description: 'URL deleted successfully' })
  @ApiResponse({ status: 404, description: 'URL not found' })
  @Delete(':shortCode')
  deleteUrl(@Param('shortCode') shortCode: string) {
    return this.urlsService.deleteUrl(shortCode);
  }
}