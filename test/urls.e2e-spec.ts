import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { Click } from '../src/urls/entities/click.entity';
import { Url } from '../src/urls/entities/url.entity';
import { countClicks, createUrl, insertClick } from './support/fixtures';
import { createTestApp, TestApp } from './support/test-app';
import { waitFor } from './support/wait-for';

interface ShortenBody {
  id: number;
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  expiresAt: string | null;
  createdAt: string;
}

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
}

interface StatsBody {
  shortCode: string;
  originalUrl: string;
  totalClicks: number;
  isActive: boolean;
  expiresAt: string | null;
  analytics: {
    clicksPerDay: { date: string; count: number }[];
    topReferrers: { referrer: string; count: number }[];
    deviceBreakdown: { device: string; count: number }[];
  };
}

interface ListBody {
  data: { shortCode: string }[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const BOT_UA = 'Googlebot/2.1 (+http://www.google.com/bot.html)';

// Every POST /urls/shorten in this file counts against the 10/min limit of
// this app instance, so keep them few (the 429 itself lives in its own file).
describe('URLs API (e2e, real PostgreSQL)', () => {
  let ctx: TestApp;

  const api = () => request(ctx.app.getHttpServer());
  const urls = () => ctx.dataSource.getRepository(Url);
  const clicks = () => ctx.dataSource.getRepository(Click);

  /**
   * GET /urls/:code expecting a 302, then wait until the fire-and-forget click
   * tracking has been committed, so no write leaks into the next test.
   */
  async function redirectAndSettle(
    url: Url,
    headers: Record<string, string> = {},
  ) {
    const before = (await urls().findOneByOrFail({ id: url.id })).clickCount;
    let req = api().get(`/urls/${url.shortCode}`);
    for (const [name, value] of Object.entries(headers)) {
      req = req.set(name, value);
    }
    const response = await req.expect(302);
    await waitFor(
      async () =>
        (await urls().findOneByOrFail({ id: url.id })).clickCount ===
        before + 1,
      `click number ${before + 1} of ${url.shortCode}`,
    );
    return response;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.resetState();
  });

  describe('POST /urls/shorten', () => {
    it('creates a short link: 201 with the documented shape, and stores it', async () => {
      const appUrl = ctx.app.get(ConfigService).get<string>('APP_URL');

      const res = await api()
        .post('/urls/shorten')
        .send({ originalUrl: 'https://example.com/some/long/path?x=1' })
        .expect(201);

      const body = res.body as ShortenBody;
      expect(body).toEqual({
        id: expect.any(Number) as number,
        originalUrl: 'https://example.com/some/long/path?x=1',
        shortCode: expect.stringMatching(/^[A-Za-z0-9_-]{8}$/) as string,
        shortUrl: `${appUrl}/urls/${body.shortCode}`,
        expiresAt: null,
        createdAt: expect.any(String) as string,
      });
      const row = await urls().findOneByOrFail({ shortCode: body.shortCode });
      expect(row).toMatchObject({
        id: body.id,
        originalUrl: 'https://example.com/some/long/path?x=1',
        customAlias: null,
        clickCount: 0,
        isActive: true,
        expiresAt: null,
      });
    });

    it('uses the custom alias and applies expiresIn', async () => {
      const before = Date.now();
      const res = await api()
        .post('/urls/shorten')
        .send({
          originalUrl: 'https://example.com',
          customAlias: 'my-portfolio',
          expiresIn: 60,
        })
        .expect(201);
      const after = Date.now();

      const body = res.body as ShortenBody;
      expect(body.shortCode).toBe('my-portfolio');
      const expiresAtMs = new Date(body.expiresAt ?? '').getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 60 * 60_000);
      expect(expiresAtMs).toBeLessThanOrEqual(after + 60 * 60_000);
      const row = await urls().findOneByOrFail({ shortCode: 'my-portfolio' });
      expect(row.customAlias).toBe('my-portfolio');
      expect(row.expiresAt).toBeInstanceOf(Date);
    });

    it('rejects an invalid URL with 400 in the global error format and stores nothing', async () => {
      const res = await api()
        .post('/urls/shorten')
        .send({ originalUrl: 'javascript:alert(1)' })
        .expect(400);

      const body = res.body as ErrorBody;
      expect(body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: ['Must be a valid URL (e.g. https://google.com)'],
        timestamp: expect.any(String) as string,
      });
      expect(await urls().count()).toBe(0);
    });

    it('rejects a duplicate alias with 409 and keeps the original link', async () => {
      await createUrl(ctx.dataSource, {
        shortCode: 'taken-alias',
        customAlias: 'taken-alias',
        originalUrl: 'https://first.example',
      });

      const res = await api()
        .post('/urls/shorten')
        .send({
          originalUrl: 'https://second.example',
          customAlias: 'taken-alias',
        })
        .expect(409);

      const body = res.body as ErrorBody;
      expect(body.statusCode).toBe(409);
      expect(body.error).toBe('Conflict');
      expect(body.message).toContain('taken-alias');
      const rows = await urls().findBy({ shortCode: 'taken-alias' });
      expect(rows).toHaveLength(1);
      expect(rows[0].originalUrl).toBe('https://first.example');
    });

    it('strips unknown fields instead of storing them', async () => {
      const res = await api()
        .post('/urls/shorten')
        .send({
          originalUrl: 'https://example.com',
          isActive: false,
          clickCount: 999,
        })
        .expect(201);

      const row = await urls().findOneByOrFail({
        shortCode: (res.body as ShortenBody).shortCode,
      });
      expect(row.isActive).toBe(true);
      expect(row.clickCount).toBe(0);
    });
  });

  describe('GET /urls/:shortCode', () => {
    it('answers 302 with the original URL in Location', async () => {
      const url = await createUrl(ctx.dataSource, {
        originalUrl: 'https://example.com/target?a=1',
      });

      const res = await redirectAndSettle(url);

      expect(res.headers.location).toBe('https://example.com/target?a=1');
    });

    it('records the click row and increments clickCount', async () => {
      const url = await createUrl(ctx.dataSource);

      await redirectAndSettle(url, {
        'User-Agent': 'jest-e2e-agent',
        Referer: 'https://referrer.example/page',
      });

      const [click] = await clicks().findBy({ urlId: url.id });
      expect(await countClicks(ctx.dataSource, url.id)).toBe(1);
      expect(click).toMatchObject({
        urlId: url.id,
        userAgent: 'jest-e2e-agent',
        referrer: 'https://referrer.example/page',
      });
      expect(click.ip).toBeTruthy();
      expect(click.clickedAt).toBeInstanceOf(Date);
      expect((await urls().findOneByOrFail({ id: url.id })).clickCount).toBe(1);
    });

    it('counts every redirect (the second one may be served from the cache)', async () => {
      const url = await createUrl(ctx.dataSource);

      await redirectAndSettle(url);
      await redirectAndSettle(url);

      expect(await countClicks(ctx.dataSource, url.id)).toBe(2);
      expect((await urls().findOneByOrFail({ id: url.id })).clickCount).toBe(2);
    });

    it('answers 410 for an expired link', async () => {
      const url = await createUrl(ctx.dataSource, {
        expiresAt: new Date(Date.now() - 60_000),
      });

      const res = await api().get(`/urls/${url.shortCode}`).expect(410);

      expect(res.body as ErrorBody).toMatchObject({
        statusCode: 410,
        error: 'Gone',
      });
    });

    it('answers 404 for a soft-deleted link', async () => {
      const url = await createUrl(ctx.dataSource, { isActive: false });

      const res = await api().get(`/urls/${url.shortCode}`).expect(404);

      expect(res.body as ErrorBody).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
      });
    });

    it('answers 404 in the global error format for an unknown code', async () => {
      const res = await api().get('/urls/doesnotexist').expect(404);

      expect(res.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Link not found',
        timestamp: expect.any(String) as string,
      });
    });
  });

  describe('GET /urls/:shortCode/stats', () => {
    it('runs the three analytics queries on PostgreSQL', async () => {
      const url = await createUrl(ctx.dataSource, { clickCount: 6 });
      const insert = (
        daysAgo: number,
        referrer: string | null,
        userAgent: string | null,
      ) =>
        insertClick(ctx.dataSource, {
          urlId: url.id,
          daysAgo,
          referrer,
          userAgent,
        });
      const twoDaysAgo = await insert(2, 'https://facebook.com/a', IPHONE_UA);
      expect(await insert(2, 'https://facebook.com/a', ANDROID_UA)).toBe(
        twoDaysAgo,
      );
      const oneDayAgo = await insert(1, 'https://facebook.com/a', DESKTOP_UA);
      await insert(1, null, DESKTOP_UA);
      await insert(1, null, BOT_UA);
      // 10 days old: outside the 7-day window of clicksPerDay, no user agent
      await insert(10, 'https://t.co/z', null);

      const res = await api().get(`/urls/${url.shortCode}/stats`).expect(200);

      const body = res.body as StatsBody;
      expect(body).toMatchObject({
        shortCode: url.shortCode,
        originalUrl: url.originalUrl,
        totalClicks: 6,
        isActive: true,
        expiresAt: null,
      });
      expect(body.analytics.clicksPerDay).toEqual([
        { date: twoDaysAgo, count: 2 },
        { date: oneDayAgo, count: 3 },
      ]);
      expect(body.analytics.topReferrers).toEqual([
        { referrer: 'https://facebook.com/a', count: 3 },
        { referrer: 'Direct', count: 2 },
        { referrer: 'https://t.co/z', count: 1 },
      ]);
      const devices = Object.fromEntries(
        body.analytics.deviceBreakdown.map((row) => [row.device, row.count]),
      );
      expect(devices).toEqual({ mobile: 2, desktop: 2, bot: 1, unknown: 1 });
    });

    it('splits mobile and desktop by the User-Agent of real redirects', async () => {
      const url = await createUrl(ctx.dataSource);
      await redirectAndSettle(url, {
        'User-Agent': IPHONE_UA,
        Referer: 'https://news.example/post',
      });
      await redirectAndSettle(url, {
        'User-Agent': DESKTOP_UA,
        Referer: 'https://news.example/post',
      });
      await redirectAndSettle(url, { 'User-Agent': DESKTOP_UA });

      const res = await api().get(`/urls/${url.shortCode}/stats`).expect(200);

      const body = res.body as StatsBody;
      expect(body.totalClicks).toBe(3);
      const devices = Object.fromEntries(
        body.analytics.deviceBreakdown.map((row) => [row.device, row.count]),
      );
      expect(devices).toEqual({ mobile: 1, desktop: 2 });
      expect(body.analytics.topReferrers).toEqual([
        { referrer: 'https://news.example/post', count: 2 },
        { referrer: 'Direct', count: 1 },
      ]);
      expect(body.analytics.clicksPerDay).toHaveLength(1);
      expect(body.analytics.clicksPerDay[0].count).toBe(3);
    });

    it('returns empty analytics for a link without clicks', async () => {
      const url = await createUrl(ctx.dataSource);

      const res = await api().get(`/urls/${url.shortCode}/stats`).expect(200);

      expect((res.body as StatsBody).analytics).toEqual({
        clicksPerDay: [],
        topReferrers: [],
        deviceBreakdown: [],
      });
    });

    it('answers 404 for an unknown or soft-deleted link', async () => {
      const deleted = await createUrl(ctx.dataSource, { isActive: false });

      await api().get('/urls/doesnotexist/stats').expect(404);
      await api().get(`/urls/${deleted.shortCode}/stats`).expect(404);
    });
  });

  describe('PATCH /urls/:shortCode', () => {
    it('changes the target, and the next redirect already uses it', async () => {
      const url = await createUrl(ctx.dataSource, {
        originalUrl: 'https://old.example',
      });
      // warm the cache with the old target
      const before = await redirectAndSettle(url);
      expect(before.headers.location).toBe('https://old.example');

      const res = await api()
        .patch(`/urls/${url.shortCode}`)
        .send({ originalUrl: 'https://new.example' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: url.id,
        originalUrl: 'https://new.example',
        shortCode: url.shortCode,
        expiresAt: null,
      });
      const after = await redirectAndSettle(url);
      expect(after.headers.location).toBe('https://new.example');
    });

    it('sets a new expiry', async () => {
      const url = await createUrl(ctx.dataSource);

      const before = Date.now();
      const res = await api()
        .patch(`/urls/${url.shortCode}`)
        .send({ expiresIn: 30 })
        .expect(200);

      const expiresAtMs = new Date(
        (res.body as ShortenBody).expiresAt ?? '',
      ).getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 30 * 60_000);
      expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + 30 * 60_000);
    });

    it('rejects an invalid URL with 400 and leaves the link unchanged', async () => {
      const url = await createUrl(ctx.dataSource, {
        originalUrl: 'https://keep.example',
      });

      await api()
        .patch(`/urls/${url.shortCode}`)
        .send({ originalUrl: 'javascript:alert(1)' })
        .expect(400);

      expect((await urls().findOneByOrFail({ id: url.id })).originalUrl).toBe(
        'https://keep.example',
      );
    });

    it('answers 404 for an unknown or soft-deleted link', async () => {
      const deleted = await createUrl(ctx.dataSource, { isActive: false });

      await api()
        .patch('/urls/doesnotexist')
        .send({ originalUrl: 'https://x.example' })
        .expect(404);
      await api()
        .patch(`/urls/${deleted.shortCode}`)
        .send({ originalUrl: 'https://x.example' })
        .expect(404);
    });
  });

  describe('DELETE /urls/:shortCode', () => {
    it('soft-deletes the link, and the next redirect is 404', async () => {
      const url = await createUrl(ctx.dataSource);
      // warm the cache so the delete has to evict it
      await redirectAndSettle(url);

      const res = await api().delete(`/urls/${url.shortCode}`).expect(200);

      expect(res.body).toEqual({
        message: `Link /${url.shortCode} was deleted`,
      });
      await api().get(`/urls/${url.shortCode}`).expect(404);
      const row = await urls().findOneByOrFail({ id: url.id });
      expect(row.isActive).toBe(false);
      expect(await countClicks(ctx.dataSource, url.id)).toBe(1);
    });

    it('answers 404 for an unknown code', async () => {
      await api().delete('/urls/doesnotexist').expect(404);
    });
  });

  describe('GET /urls', () => {
    it('lists active links newest first with pagination meta', async () => {
      const first = await createUrl(ctx.dataSource);
      const second = await createUrl(ctx.dataSource);
      const third = await createUrl(ctx.dataSource);
      await createUrl(ctx.dataSource, { isActive: false });

      const page1 = await api().get('/urls?page=1&limit=2').expect(200);
      const page2 = await api().get('/urls?page=2&limit=2').expect(200);

      const body1 = page1.body as ListBody;
      expect(body1.data.map((row) => row.shortCode)).toEqual([
        third.shortCode,
        second.shortCode,
      ]);
      expect(body1.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect((page2.body as ListBody).data.map((row) => row.shortCode)).toEqual(
        [first.shortCode],
      );
    });

    it('defaults to page 1 with 10 per page', async () => {
      const res = await api().get('/urls').expect(200);

      expect((res.body as ListBody).meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });
  });
});
