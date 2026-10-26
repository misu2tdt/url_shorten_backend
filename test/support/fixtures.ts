import { DataSource } from 'typeorm';
import { Click } from '../../src/urls/entities/click.entity';
import { Url } from '../../src/urls/entities/url.entity';

let counter = 0;

/** Inserts a link straight through the repository (no HTTP, no rate limiter). */
export async function createUrl(
  dataSource: DataSource,
  overrides: Partial<Url> = {},
): Promise<Url> {
  counter += 1;
  const repository = dataSource.getRepository(Url);
  return repository.save(
    repository.create({
      originalUrl: `https://example.com/original-${counter}`,
      shortCode: `fx${String(counter).padStart(6, '0')}`,
      customAlias: null,
      expiresAt: null,
      isActive: true,
      ...overrides,
    }),
  );
}

export async function countClicks(
  dataSource: DataSource,
  urlId: number,
): Promise<number> {
  return dataSource.getRepository(Click).countBy({ urlId });
}

/**
 * Inserts a click at noon, `daysAgo` days ago (database clock), so the
 * calendar day it lands on does not depend on the time the test runs.
 * Returns that day as `YYYY-MM-DD`, exactly as the stats query groups it.
 */
export async function insertClick(
  dataSource: DataSource,
  click: {
    urlId: number;
    daysAgo: number;
    referrer: string | null;
    userAgent: string | null;
  },
): Promise<string> {
  const rows = await dataSource.query<{ day: string }[]>(
    `INSERT INTO clicks ("url_id", "ip", "userAgent", "referrer", "clickedAt")
     VALUES ($1, '127.0.0.1', $2, $3,
             date_trunc('day', NOW()) - ($4::int * INTERVAL '1 day') + INTERVAL '12 hours')
     RETURNING TO_CHAR("clickedAt", 'YYYY-MM-DD') AS day`,
    [click.urlId, click.userAgent, click.referrer, click.daysAgo],
  );
  return rows[0].day;
}
