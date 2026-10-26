import request from 'supertest';
import { createTestApp, TestApp } from './support/test-app';

describe('AppController (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('/ (GET)', () => {
    return request(ctx.app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
