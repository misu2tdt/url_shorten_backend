import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ShortenUrlDto } from './shorten-url.dto';

async function invalidProperties(input: object): Promise<string[]> {
  const errors = await validate(plainToInstance(ShortenUrlDto, input));
  return errors.map((error) => error.property);
}

describe('ShortenUrlDto', () => {
  describe('valid input', () => {
    it('accepts just an http(s) URL', async () => {
      await expect(
        invalidProperties({ originalUrl: 'https://google.com' }),
      ).resolves.toEqual([]);
      await expect(
        invalidProperties({ originalUrl: 'http://example.com/a?b=1#c' }),
      ).resolves.toEqual([]);
    });

    it('accepts a URL with alias and expiresIn', async () => {
      await expect(
        invalidProperties({
          originalUrl: 'https://google.com',
          customAlias: 'my-portfolio',
          expiresIn: 60,
        }),
      ).resolves.toEqual([]);
    });
  });

  describe('originalUrl', () => {
    it.each([
      ['missing', {}],
      ['empty', { originalUrl: '' }],
      ['not a URL', { originalUrl: 'not a url' }],
      ['javascript: scheme', { originalUrl: 'javascript:alert(1)' }],
      [
        'data: scheme',
        { originalUrl: 'data:text/html,<script>alert(1)</script>' },
      ],
      ['file: scheme', { originalUrl: 'file:///etc/passwd' }],
    ])('rejects %s', async (_label, input) => {
      await expect(invalidProperties(input)).resolves.toContain('originalUrl');
    });
  });

  describe('customAlias', () => {
    const withAlias = (customAlias: unknown) => ({
      originalUrl: 'https://google.com',
      customAlias,
    });

    it.each([
      ['3 chars (lower bound)', 'abc'],
      ['30 chars (upper bound)', 'a'.repeat(30)],
      ['letters, digits and hyphens', 'My-Link-42'],
    ])('accepts %s', async (_label, alias) => {
      await expect(invalidProperties(withAlias(alias))).resolves.toEqual([]);
    });

    it.each([
      ['2 chars (too short)', 'ab'],
      ['31 chars (too long)', 'a'.repeat(31)],
      ['a space', 'has space'],
      ['an underscore', 'under_score'],
      ['a slash', 'a/b'],
      ['non-ASCII letters', 'xin-chào'],
      ['a non-string', 12345],
    ])('rejects %s', async (_label, alias) => {
      await expect(invalidProperties(withAlias(alias))).resolves.toContain(
        'customAlias',
      );
    });
  });

  describe('expiresIn', () => {
    const withExpiry = (expiresIn: unknown) => ({
      originalUrl: 'https://google.com',
      expiresIn,
    });

    it.each([1, 60, 525600])('accepts %p minutes', async (minutes) => {
      await expect(invalidProperties(withExpiry(minutes))).resolves.toEqual([]);
    });

    it.each([
      ['0', 0],
      ['a negative number', -5],
      ['525601 (over 365 days)', 525601],
      ['a fraction', 1.5],
      ['a numeric string', '60'],
    ])('rejects %s', async (_label, minutes) => {
      await expect(invalidProperties(withExpiry(minutes))).resolves.toContain(
        'expiresIn',
      );
    });
  });
});
