import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import type { FindManyOptions, FindOneOptions } from 'typeorm';
import { nanoid } from 'nanoid';
import { UrlsService } from './urls.service';
import { Url } from './entities/url.entity';
import { Click } from './entities/click.entity';

jest.mock('nanoid', () => ({ nanoid: jest.fn() }));

const APP_URL = 'http://localhost:3000';
const MINUTE_MS = 60_000;

const flushPromises = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

function makeUrl(overrides: Partial<Url> = {}): Url {
  return Object.assign(new Url(), {
    id: 1,
    originalUrl: 'https://example.com/page',
    shortCode: 'abc12345',
    customAlias: null,
    clickCount: 0,
    isActive: true,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    clicks: [],
    ...overrides,
  });
}

class QueryBuilderStub {
  readonly whereParams: unknown[] = [];
  private selectExpr = '';

  constructor(private readonly rowsFor: (selectExpr: string) => unknown[]) {}

  select(expr: string) {
    this.selectExpr = expr;
    return this;
  }
  addSelect() {
    return this;
  }
  where(_condition: string, params: unknown) {
    this.whereParams.push(params);
    return this;
  }
  andWhere() {
    return this;
  }
  groupBy() {
    return this;
  }
  orderBy() {
    return this;
  }
  limit() {
    return this;
  }
  getRawMany() {
    return Promise.resolve(this.rowsFor(this.selectExpr));
  }
}

describe('UrlsService', () => {
  let service: UrlsService;
  let errorSpy: jest.SpyInstance;

  const nanoidMock = jest.mocked(nanoid);

  const urlRepo = {
    create: jest.fn<Url, [Partial<Url>]>(),
    save: jest.fn<Promise<Url>, [Url]>(),
    findOne: jest.fn<Promise<Url | null>, [FindOneOptions<Url>]>(),
    findAndCount: jest.fn<Promise<[Url[], number]>, [FindManyOptions<Url>]>(),
    increment: jest.fn<Promise<unknown>, [unknown, string, number]>(),
  };
  const clickRepo = {
    create: jest.fn<Click, [Partial<Click>]>(),
    save: jest.fn<Promise<Click>, [Click]>(),
    createQueryBuilder: jest.fn<QueryBuilderStub, [string]>(),
  };
  const cache = {
    get: jest.fn<Promise<string | undefined>, [string]>(),
    set: jest.fn<Promise<void>, [string, string, number]>(),
    del: jest.fn<Promise<boolean>, [string]>(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    urlRepo.create.mockImplementation((data) => Object.assign(new Url(), data));
    urlRepo.save.mockImplementation((url) =>
      Promise.resolve(
        Object.assign(url, {
          id: url.id ?? 42,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        }),
      ),
    );
    clickRepo.create.mockImplementation((data) =>
      Object.assign(new Click(), data),
    );
    clickRepo.save.mockImplementation((click) => Promise.resolve(click));
    urlRepo.increment.mockResolvedValue(undefined);
    cache.get.mockResolvedValue(undefined);
    cache.set.mockResolvedValue(undefined);
    cache.del.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlsService,
        { provide: getRepositoryToken(Url), useValue: urlRepo },
        { provide: getRepositoryToken(Click), useValue: clickRepo },
        {
          provide: ConfigService,
          useValue: { get: jest.fn<string, [string]>(() => APP_URL) },
        },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();

    service = module.get(UrlsService);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('shortenUrl', () => {
    it('rejects a custom alias that is already used with 409 and saves nothing', async () => {
      urlRepo.findOne.mockResolvedValue(makeUrl({ shortCode: 'taken' }));

      const result = service.shortenUrl({
        originalUrl: 'https://example.com',
        customAlias: 'taken',
      });

      await expect(result).rejects.toBeInstanceOf(ConflictException);
      await expect(result).rejects.toThrow('taken');
      expect(urlRepo.save).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('uses a free custom alias as shortCode and customAlias', async () => {
      urlRepo.findOne.mockResolvedValue(null);

      const result = await service.shortenUrl({
        originalUrl: 'https://example.com',
        customAlias: 'my-alias',
      });

      expect(urlRepo.findOne).toHaveBeenCalledWith({
        where: { shortCode: 'my-alias' },
      });
      expect(urlRepo.create).toHaveBeenCalledWith({
        originalUrl: 'https://example.com',
        shortCode: 'my-alias',
        customAlias: 'my-alias',
        expiresAt: null,
      });
      expect(urlRepo.save).toHaveBeenCalledTimes(1);
      expect(nanoidMock).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 42,
        originalUrl: 'https://example.com',
        shortCode: 'my-alias',
        shortUrl: `${APP_URL}/urls/my-alias`,
        expiresAt: null,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      });
    });

    it('generates an 8-char code when no alias is given', async () => {
      nanoidMock.mockReturnValue('gen12345');
      urlRepo.findOne.mockResolvedValue(null);

      const result = await service.shortenUrl({
        originalUrl: 'https://example.com',
      });

      expect(nanoidMock).toHaveBeenCalledWith(8);
      expect(urlRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ shortCode: 'gen12345', customAlias: null }),
      );
      expect(result.shortCode).toBe('gen12345');
      expect(result.shortUrl).toBe(`${APP_URL}/urls/gen12345`);
    });

    it('retries on a collision and succeeds with the next code', async () => {
      nanoidMock
        .mockReturnValueOnce('dup00000')
        .mockReturnValueOnce('ok000000');
      urlRepo.findOne
        .mockResolvedValueOnce(makeUrl({ shortCode: 'dup00000' }))
        .mockResolvedValueOnce(null);

      const result = await service.shortenUrl({
        originalUrl: 'https://example.com',
      });

      expect(nanoidMock).toHaveBeenCalledTimes(2);
      expect(urlRepo.findOne).toHaveBeenCalledTimes(2);
      expect(result.shortCode).toBe('ok000000');
    });

    it('gives up with 409 after 5 collisions and saves nothing', async () => {
      nanoidMock.mockReturnValue('dup00000');
      urlRepo.findOne.mockResolvedValue(makeUrl({ shortCode: 'dup00000' }));

      await expect(
        service.shortenUrl({ originalUrl: 'https://example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(nanoidMock).toHaveBeenCalledTimes(5);
      expect(urlRepo.findOne).toHaveBeenCalledTimes(5);
      expect(urlRepo.save).not.toHaveBeenCalled();
    });

    it('sets expiresAt to now + expiresIn minutes', async () => {
      nanoidMock.mockReturnValue('gen12345');
      urlRepo.findOne.mockResolvedValue(null);

      const before = Date.now();
      const result = await service.shortenUrl({
        originalUrl: 'https://example.com',
        expiresIn: 90,
      });
      const after = Date.now();

      expect(result.expiresAt).toBeInstanceOf(Date);
      const expiresAtMs = result.expiresAt?.getTime() ?? 0;
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 90 * MINUTE_MS);
      expect(expiresAtMs).toBeLessThanOrEqual(after + 90 * MINUTE_MS);
    });

    it('caches the new link under url:<code> with the original URL', async () => {
      nanoidMock.mockReturnValue('gen12345');
      urlRepo.findOne.mockResolvedValue(null);

      await service.shortenUrl({ originalUrl: 'https://example.com/x' });

      expect(cache.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = cache.set.mock.calls[0];
      expect(key).toBe('url:gen12345');
      expect(value).toBe('https://example.com/x');
      expect(ttl).toBeGreaterThan(0);
    });

    it('gives an expiring link a smaller cache TTL than a non-expiring one', async () => {
      nanoidMock.mockReturnValue('gen12345');
      urlRepo.findOne.mockResolvedValue(null);

      await service.shortenUrl({ originalUrl: 'https://example.com' });
      await service.shortenUrl({
        originalUrl: 'https://example.com',
        expiresIn: 1,
      });

      const plainTtl = cache.set.mock.calls[0][2];
      const expiringTtl = cache.set.mock.calls[1][2];
      expect(expiringTtl).toBeGreaterThan(0);
      expect(expiringTtl).toBeLessThan(plainTtl);
    });
  });

  describe('getOriginalUrl', () => {
    const tracking = {
      ip: '203.0.113.9',
      userAgent: 'jest-agent',
      referrer: 'https://ref.example',
    };

    it('cache hit: returns the cached URL, skips the full lookup and still tracks the click', async () => {
      cache.get.mockResolvedValue('https://cached.example');
      urlRepo.findOne.mockResolvedValue(makeUrl({ id: 7 }));

      const result = await service.getOriginalUrl('abc12345', tracking);
      await flushPromises();

      expect(result).toBe('https://cached.example');
      expect(cache.get).toHaveBeenCalledWith('url:abc12345');
      expect(cache.set).not.toHaveBeenCalled();
      // the only DB lookup is the id lookup done by trackClick
      expect(urlRepo.findOne).toHaveBeenCalledTimes(1);
      expect(urlRepo.findOne).toHaveBeenCalledWith({
        where: { shortCode: 'abc12345' },
        select: ['id'],
      });
      expect(clickRepo.create).toHaveBeenCalledWith({
        urlId: 7,
        ip: '203.0.113.9',
        userAgent: 'jest-agent',
        referrer: 'https://ref.example',
      });
      expect(clickRepo.save).toHaveBeenCalledTimes(1);
      expect(urlRepo.increment).toHaveBeenCalledWith(
        { id: 7 },
        'clickCount',
        1,
      );
    });

    it('cache miss: reads the DB, fills the cache and tracks the click', async () => {
      const record = makeUrl({ id: 3, originalUrl: 'https://db.example' });
      urlRepo.findOne.mockImplementation((options) =>
        Promise.resolve(options.select ? makeUrl({ id: 3 }) : record),
      );

      const result = await service.getOriginalUrl('abc12345', tracking);
      await flushPromises();

      expect(result).toBe('https://db.example');
      expect(urlRepo.findOne).toHaveBeenCalledWith({
        where: { shortCode: 'abc12345' },
      });
      expect(cache.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = cache.set.mock.calls[0];
      expect(key).toBe('url:abc12345');
      expect(value).toBe('https://db.example');
      expect(ttl).toBeGreaterThan(0);
      expect(clickRepo.save).toHaveBeenCalledTimes(1);
      expect(urlRepo.increment).toHaveBeenCalledWith(
        { id: 3 },
        'clickCount',
        1,
      );
    });

    it('gives an expiring link a smaller cache TTL than a non-expiring one', async () => {
      urlRepo.findOne.mockResolvedValueOnce(makeUrl());
      await service.getOriginalUrl('abc12345');
      urlRepo.findOne.mockResolvedValueOnce(
        makeUrl({ expiresAt: new Date(Date.now() + 2 * MINUTE_MS) }),
      );
      await service.getOriginalUrl('abc12345');
      await flushPromises();

      const plainTtl = cache.set.mock.calls[0][2];
      const expiringTtl = cache.set.mock.calls[1][2];
      expect(expiringTtl).toBeGreaterThan(0);
      expect(expiringTtl).toBeLessThan(plainTtl);
    });

    it('unknown code: 404, nothing cached, no click tracked', async () => {
      urlRepo.findOne.mockResolvedValue(null);

      await expect(service.getOriginalUrl('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await flushPromises();

      expect(cache.set).not.toHaveBeenCalled();
      expect(clickRepo.save).not.toHaveBeenCalled();
    });

    it('soft-deleted link: 404, nothing cached, no click tracked', async () => {
      urlRepo.findOne.mockResolvedValue(makeUrl({ isActive: false }));

      await expect(service.getOriginalUrl('abc12345')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await flushPromises();

      expect(cache.set).not.toHaveBeenCalled();
      expect(clickRepo.save).not.toHaveBeenCalled();
    });

    it('expired link: 410, cache entry deleted, nothing cached, no click tracked', async () => {
      urlRepo.findOne.mockResolvedValue(
        makeUrl({ expiresAt: new Date(Date.now() - MINUTE_MS) }),
      );

      await expect(service.getOriginalUrl('abc12345')).rejects.toBeInstanceOf(
        GoneException,
      );
      await flushPromises();

      expect(cache.del).toHaveBeenCalledWith('url:abc12345');
      expect(cache.set).not.toHaveBeenCalled();
      expect(clickRepo.save).not.toHaveBeenCalled();
    });

    it('link whose expiry is still in the future is served', async () => {
      urlRepo.findOne.mockResolvedValue(
        makeUrl({ expiresAt: new Date(Date.now() + MINUTE_MS) }),
      );

      await expect(service.getOriginalUrl('abc12345')).resolves.toBe(
        'https://example.com/page',
      );
      await flushPromises();
      expect(cache.del).not.toHaveBeenCalled();
    });

    it('a failing trackClick (insert) does not break the redirect and is logged', async () => {
      cache.get.mockResolvedValue('https://cached.example');
      urlRepo.findOne.mockResolvedValue(makeUrl({ id: 7 }));
      clickRepo.save.mockRejectedValue(new Error('db down'));

      await expect(service.getOriginalUrl('abc12345', tracking)).resolves.toBe(
        'https://cached.example',
      );
      await flushPromises();

      expect(errorSpy).toHaveBeenCalledWith('Track click failed:', 'db down');
      expect(urlRepo.increment).not.toHaveBeenCalled();
    });

    it('a failing trackClick on the DB path does not break the redirect either', async () => {
      urlRepo.findOne.mockImplementation((options) =>
        Promise.resolve(makeUrl({ id: options.select ? 5 : 1 })),
      );
      urlRepo.increment.mockRejectedValue(new Error('increment failed'));

      await expect(service.getOriginalUrl('abc12345')).resolves.toBe(
        'https://example.com/page',
      );
      await flushPromises();

      expect(errorSpy).toHaveBeenCalledWith(
        'Track click failed:',
        'increment failed',
      );
    });

    it('logs non-Error rejections of trackClick as strings', async () => {
      cache.get.mockResolvedValue('https://cached.example');
      urlRepo.findOne.mockRejectedValue('boom');

      await service.getOriginalUrl('abc12345');
      await flushPromises();

      expect(errorSpy).toHaveBeenCalledWith('Track click failed:', 'boom');
    });

    it('does not record a click when the link vanished before tracking', async () => {
      cache.get.mockResolvedValue('https://cached.example');
      urlRepo.findOne.mockResolvedValue(null);

      await service.getOriginalUrl('abc12345', tracking);
      await flushPromises();

      expect(clickRepo.save).not.toHaveBeenCalled();
      expect(urlRepo.increment).not.toHaveBeenCalled();
    });
  });

  describe('deleteUrl', () => {
    it('soft-deletes the link and removes its cache entry', async () => {
      const record = makeUrl();
      urlRepo.findOne.mockResolvedValue(record);

      const result = await service.deleteUrl('abc12345');

      expect(record.isActive).toBe(false);
      expect(urlRepo.save).toHaveBeenCalledWith(record);
      expect(cache.del).toHaveBeenCalledWith('url:abc12345');
      expect(result).toEqual({ message: 'Link /abc12345 was deleted' });
    });

    it('unknown code: 404 and nothing is saved or evicted', async () => {
      urlRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteUrl('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(urlRepo.save).not.toHaveBeenCalled();
      expect(cache.del).not.toHaveBeenCalled();
    });
  });

  describe('updateUrl', () => {
    it('changes originalUrl, evicts the cache entry and returns the new shape', async () => {
      const record = makeUrl();
      urlRepo.findOne.mockResolvedValue(record);

      const result = await service.updateUrl('abc12345', {
        originalUrl: 'https://new.example',
      });

      expect(record.originalUrl).toBe('https://new.example');
      expect(urlRepo.save).toHaveBeenCalledWith(record);
      expect(cache.del).toHaveBeenCalledWith('url:abc12345');
      expect(result).toEqual({
        id: 1,
        originalUrl: 'https://new.example',
        shortCode: 'abc12345',
        shortUrl: `${APP_URL}/urls/abc12345`,
        expiresAt: null,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });
    });

    it('sets expiresAt to now + expiresIn minutes', async () => {
      const record = makeUrl();
      urlRepo.findOne.mockResolvedValue(record);

      const before = Date.now();
      await service.updateUrl('abc12345', { expiresIn: 30 });
      const after = Date.now();

      const expiresAtMs = record.expiresAt?.getTime() ?? 0;
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 30 * MINUTE_MS);
      expect(expiresAtMs).toBeLessThanOrEqual(after + 30 * MINUTE_MS);
      expect(record.originalUrl).toBe('https://example.com/page');
      expect(cache.del).toHaveBeenCalledWith('url:abc12345');
    });

    it('unknown code: 404 and nothing is saved or evicted', async () => {
      urlRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateUrl('nope', { originalUrl: 'https://x.example' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(urlRepo.save).not.toHaveBeenCalled();
      expect(cache.del).not.toHaveBeenCalled();
    });

    it('soft-deleted link: 404 and nothing is saved or evicted', async () => {
      urlRepo.findOne.mockResolvedValue(makeUrl({ isActive: false }));

      await expect(
        service.updateUrl('abc12345', { originalUrl: 'https://x.example' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(urlRepo.save).not.toHaveBeenCalled();
      expect(cache.del).not.toHaveBeenCalled();
    });
  });

  describe('getAllUrls', () => {
    it('queries active links newest first and returns pagination meta', async () => {
      const rows = [makeUrl({ id: 1 }), makeUrl({ id: 2 })];
      urlRepo.findAndCount.mockResolvedValue([rows, 25]);

      const result = await service.getAllUrls(2, 10);

      expect(urlRepo.findAndCount).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { createdAt: 'DESC' },
        skip: 10,
        take: 10,
      });
      expect(result).toEqual({
        data: rows,
        meta: { page: 2, limit: 10, total: 25, totalPages: 3 },
      });
    });

    it('defaults to page 1 and limit 10', async () => {
      urlRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getAllUrls();

      expect(urlRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('rounds totalPages up', async () => {
      urlRepo.findAndCount.mockResolvedValue([[], 21]);

      const result = await service.getAllUrls(1, 10);

      expect(result.meta.totalPages).toBe(3);
    });
  });

  describe('getUrlStats', () => {
    const builders: QueryBuilderStub[] = [];

    beforeEach(() => {
      builders.length = 0;
      clickRepo.createQueryBuilder.mockImplementation(() => {
        const builder = new QueryBuilderStub((selectExpr) => {
          if (selectExpr.includes('TO_CHAR')) {
            return [
              { date: '2026-03-01', count: '3' },
              { date: '2026-03-02', count: '12' },
            ];
          }
          if (selectExpr.includes('COALESCE')) {
            return [
              { referrer: 'https://facebook.com/a', count: '7' },
              { referrer: 'Direct', count: '2' },
            ];
          }
          return [
            { device: 'mobile', count: '5' },
            { device: 'desktop', count: '4' },
          ];
        });
        builders.push(builder);
        return builder;
      });
    });

    it('unknown code: 404 and no analytics query runs', async () => {
      urlRepo.findOne.mockResolvedValue(null);

      await expect(service.getUrlStats('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(clickRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('soft-deleted link: 404 and no analytics query runs', async () => {
      urlRepo.findOne.mockResolvedValue(makeUrl({ isActive: false }));

      await expect(service.getUrlStats('abc12345')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(clickRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('maps raw rows to numbers and reports clickCount as totalClicks', async () => {
      const expiresAt = new Date('2026-12-31T00:00:00.000Z');
      urlRepo.findOne.mockResolvedValue(
        makeUrl({ id: 9, clickCount: 17, expiresAt }),
      );

      const result = await service.getUrlStats('abc12345');

      expect(result).toEqual({
        shortCode: 'abc12345',
        originalUrl: 'https://example.com/page',
        totalClicks: 17,
        isActive: true,
        expiresAt,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        analytics: {
          clicksPerDay: [
            { date: '2026-03-01', count: 3 },
            { date: '2026-03-02', count: 12 },
          ],
          topReferrers: [
            { referrer: 'https://facebook.com/a', count: 7 },
            { referrer: 'Direct', count: 2 },
          ],
          deviceBreakdown: [
            { device: 'mobile', count: 5 },
            { device: 'desktop', count: 4 },
          ],
        },
      });
    });

    it('scopes all three analytics queries to the link id', async () => {
      urlRepo.findOne.mockResolvedValue(makeUrl({ id: 9 }));

      await service.getUrlStats('abc12345');

      expect(builders).toHaveLength(3);
      for (const builder of builders) {
        expect(builder.whereParams).toEqual([{ urlId: 9 }]);
      }
    });
  });
});
