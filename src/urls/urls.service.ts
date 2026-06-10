import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Url } from './entities/url.entity';
import { Click } from './entities/click.entity';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { nanoid } from 'nanoid';

@Injectable()
export class UrlsService {
  private readonly CACHE_PREFIX = 'url:';

  constructor(
    @InjectRepository(Url)
    private urlRepository: Repository<Url>,

    @InjectRepository(Click)
    private clickRepository: Repository<Click>,

    private configService: ConfigService,

    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  async shortenUrl(dto: ShortenUrlDto) {
    let shortCode: string;

    if (dto.customAlias) {
      const existing = await this.urlRepository.findOne({
        where: { shortCode: dto.customAlias },
      });
      if (existing) {
        throw new ConflictException(
          `Alias "${dto.customAlias}" đã được sử dụng.`,
        );
      }
      shortCode = dto.customAlias;
    } else {
      shortCode = await this.generateUniqueCode();
    }

    let expiresAt: Date | null = null;
    if (dto.expiresIn) {
      expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + dto.expiresIn);
    }

    const newUrl = this.urlRepository.create({
      originalUrl: dto.originalUrl,
      shortCode,
      customAlias: dto.customAlias || null,
      expiresAt,
    });
    await this.urlRepository.save(newUrl);

    await this.cacheManager.set(
      `${this.CACHE_PREFIX}${shortCode}`,
      newUrl.originalUrl,
      this.getCacheTTL(expiresAt),
    );

    const appUrl = this.configService.get<string>('APP_URL');
    return {
      id: newUrl.id,
      originalUrl: newUrl.originalUrl,
      shortCode: newUrl.shortCode,
      shortUrl: `${appUrl}/urls/${newUrl.shortCode}`,
      expiresAt: newUrl.expiresAt,
      createdAt: newUrl.createdAt,
    };
  }

  async getOriginalUrl(
    shortCode: string,
    trackingData?: { ip?: string; userAgent?: string; referrer?: string },
  ): Promise<string> {
    const cacheKey = `${this.CACHE_PREFIX}${shortCode}`;
    const cachedUrl = await this.cacheManager.get<string>(cacheKey);

    if (cachedUrl) {
      this.trackClick(shortCode, trackingData).catch((err) =>
        console.error('Track click failed:', err.message),
      );
      return cachedUrl;
    }

    const urlRecord = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!urlRecord || !urlRecord.isActive) {
      throw new NotFoundException('Không tìm thấy đường dẫn này!');
    }

    if (urlRecord.expiresAt && urlRecord.expiresAt < new Date()) {
      await this.cacheManager.del(cacheKey);
      throw new GoneException('Đường dẫn này đã hết hạn!');
    }

    await this.cacheManager.set(
      cacheKey,
      urlRecord.originalUrl,
      this.getCacheTTL(urlRecord.expiresAt),
    );

    this.trackClick(shortCode, trackingData).catch((err) =>
      console.error('Track click failed:', err.message),
    );

    return urlRecord.originalUrl;
  }

  async deleteUrl(shortCode: string): Promise<{ message: string }> {
    const urlRecord = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!urlRecord) {
      throw new NotFoundException('Không tìm thấy đường dẫn này!');
    }

    urlRecord.isActive = false;
    await this.urlRepository.save(urlRecord);
    await this.cacheManager.del(`${this.CACHE_PREFIX}${shortCode}`);

    return { message: `Link /${shortCode} đã được xóa.` };
  }

  async updateUrl(
    shortCode: string,
    updateData: { originalUrl?: string; expiresIn?: number },
  ) {
    const urlRecord = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!urlRecord || !urlRecord.isActive) {
      throw new NotFoundException('Không tìm thấy đường dẫn này!');
    }

    if (updateData.originalUrl) {
      urlRecord.originalUrl = updateData.originalUrl;
    }
    if (updateData.expiresIn) {
      urlRecord.expiresAt = new Date();
      urlRecord.expiresAt.setMinutes(
        urlRecord.expiresAt.getMinutes() + updateData.expiresIn,
      );
    }

    await this.urlRepository.save(urlRecord);
    await this.cacheManager.del(`${this.CACHE_PREFIX}${shortCode}`);

    const appUrl = this.configService.get<string>('APP_URL');
    return {
      id: urlRecord.id,
      originalUrl: urlRecord.originalUrl,
      shortCode: urlRecord.shortCode,
      shortUrl: `${appUrl}/urls/${urlRecord.shortCode}`,
      expiresAt: urlRecord.expiresAt,
      updatedAt: urlRecord.updatedAt,
    };
  }

  async getAllUrls(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [urls, total] = await this.urlRepository.findAndCount({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: urls,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async trackClick(
    shortCode: string,
    data?: { ip?: string; userAgent?: string; referrer?: string },
  ): Promise<void> {
    const urlRecord = await this.urlRepository.findOne({
      where: { shortCode },
      select: ['id'],
    });

    if (!urlRecord) return;

    const click = this.clickRepository.create({
      urlId: urlRecord.id,
      ip: data?.ip,
      userAgent: data?.userAgent,
      referrer: data?.referrer,
    });
    await this.clickRepository.save(click);
    await this.urlRepository.increment({ id: urlRecord.id }, 'clickCount', 1);
  }

  private getCacheTTL(expiresAt: Date | null): number {
    if (!expiresAt) return 3600;

    const remainingMs = expiresAt.getTime() - Date.now();
    const remainingSec = Math.max(Math.floor(remainingMs / 1000), 1);
    return Math.min(remainingSec, 3600);
  }

  private async generateUniqueCode(maxRetries = 5): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = nanoid(8);
      const existing = await this.urlRepository.findOne({
        where: { shortCode: code },
      });
      if (!existing) return code;
    }
    throw new ConflictException('Không thể tạo mã. Vui lòng thử lại.');
  }

  async getUrlStats(shortCode: string) {
    const urlRecord = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!urlRecord || !urlRecord.isActive) {
      throw new NotFoundException('Không tìm thấy đường dẫn này!');
    }

    const [clicksPerDay, topReferrers, deviceBreakdown] = await Promise.all([
      this.getClicksPerDay(urlRecord.id),
      this.getTopReferrers(urlRecord.id),
      this.getDeviceBreakdown(urlRecord.id),
    ]);

    return {
      shortCode: urlRecord.shortCode,
      originalUrl: urlRecord.originalUrl,
      totalClicks: urlRecord.clickCount,
      isActive: urlRecord.isActive,
      expiresAt: urlRecord.expiresAt,
      createdAt: urlRecord.createdAt,
      analytics: {
        clicksPerDay,
        topReferrers,
        deviceBreakdown,
      },
    };
  }

  private async getClicksPerDay(urlId: number) {
    const result = await this.clickRepository
      .createQueryBuilder('click')
      .select("TO_CHAR(click.clickedAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('click.url_id = :urlId', { urlId })
      .andWhere('click.clickedAt >= NOW() - INTERVAL \'7 days\'')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    return result.map((row) => ({
      date: row.date,
      count: parseInt(row.count, 10),
    }));
  }

  private async getTopReferrers(urlId: number) {
    const result = await this.clickRepository
      .createQueryBuilder('click')
      .select(
        "COALESCE(click.referrer, 'Direct')",
        'referrer',
      )
      .addSelect('COUNT(*)', 'count')
      .where('click.url_id = :urlId', { urlId })
      .groupBy('referrer')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();

    return result.map((row) => ({
      referrer: row.referrer,
      count: parseInt(row.count, 10),
    }));
  }

  private async getDeviceBreakdown(urlId: number) {
    const result = await this.clickRepository
      .createQueryBuilder('click')
      .select(
        `CASE
          WHEN click.userAgent ILIKE '%mobile%' OR click.userAgent ILIKE '%android%' OR click.userAgent ILIKE '%iphone%'
          THEN 'mobile'
          WHEN click.userAgent ILIKE '%bot%' OR click.userAgent ILIKE '%crawler%' OR click.userAgent ILIKE '%spider%'
          THEN 'bot'
          WHEN click.userAgent IS NULL
          THEN 'unknown'
          ELSE 'desktop'
        END`,
        'device',
      )
      .addSelect('COUNT(*)', 'count')
      .where('click.url_id = :urlId', { urlId })
      .groupBy('device')
      .orderBy('count', 'DESC')
      .getRawMany();

    return result.map((row) => ({
      device: row.device,
      count: parseInt(row.count, 10),
    }));
  }
}