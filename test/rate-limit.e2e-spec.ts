import request from 'supertest';
import { Url } from '../src/urls/entities/url.entity';
import { createTestApp, TestApp } from './support/test-app';

// Own spec file on purpose: the throttler keeps its counters in memory per app
// instance, so this file's app starts with an empty counter.
describe('Rate limiting (e2e)', () => {
  let ctx: TestApp;

  const api = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.resetState();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('allows 10 POST /urls/shorten per minute and answers 429 to the 11th', async () => {
    for (let i = 1; i <= 10; i++) {
      await api()
        .post('/urls/shorten')
        .send({ originalUrl: `https://example.com/page-${i}` })
        .expect(201);
    }

    const res = await api()
      .post('/urls/shorten')
      .send({ originalUrl: 'https://example.com/page-11' })
      .expect(429);

    const body = res.body as { statusCode: number; message: string };
    expect(body.statusCode).toBe(429);
    expect(body.message).toMatch(/Too Many Requests/);
    expect(await ctx.dataSource.getRepository(Url).count()).toBe(10);
  });

  it('counts each route separately: other routes still answer', async () => {
    await api().get('/urls/doesnotexist').expect(404);
    await api().get('/urls').expect(200);
  });
});
