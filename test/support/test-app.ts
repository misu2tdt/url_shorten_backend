import { INestApplication } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import type { Cache } from 'cache-manager';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

export function assertTestDatabase(name: string | undefined): void {
  if (!name || !name.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests: DB_DATABASE must end with "_test" (got "${name ?? ''}").`,
    );
  }
}

export interface TestApp {
  app: INestApplication<App>;
  dataSource: DataSource;
  /** Empties both tables (ids restart at 1) and the in-process cache. */
  resetState(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  // Checked before the app boots: `synchronize` runs on init.
  assertTestDatabase(process.env.DB_DATABASE);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  const cache = app.get<Cache>(CACHE_MANAGER);

  return {
    app,
    dataSource,
    async resetState() {
      const database = dataSource.options.database;
      assertTestDatabase(typeof database === 'string' ? database : undefined);
      await dataSource.query(
        'TRUNCATE TABLE urls, clicks RESTART IDENTITY CASCADE',
      );
      await cache.clear();
    },
    async close() {
      await app.close();
    },
  };
}
