import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUrlDto } from './update-url.dto';

async function invalidProperties(input: object): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateUrlDto, input));
  return errors.map((error) => error.property);
}

describe('UpdateUrlDto', () => {
  it.each([
    ['an empty body', {}],
    ['only originalUrl', { originalUrl: 'https://new.example/path' }],
    ['only expiresIn', { expiresIn: 30 }],
    ['both fields', { originalUrl: 'https://new.example', expiresIn: 30 }],
  ])('accepts %s', async (_label, input) => {
    await expect(invalidProperties(input)).resolves.toEqual([]);
  });

  it.each([
    ['not a URL', 'not a url'],
    ['javascript: scheme', 'javascript:alert(1)'],
    ['data: scheme', 'data:text/html,<script>alert(1)</script>'],
  ])('rejects originalUrl that is %s', async (_label, originalUrl) => {
    await expect(invalidProperties({ originalUrl })).resolves.toContain(
      'originalUrl',
    );
  });

  it.each([1, 525600])('accepts expiresIn %p', async (expiresIn) => {
    await expect(invalidProperties({ expiresIn })).resolves.toEqual([]);
  });

  it.each([0, -1, 525601, 1.5, '30'])(
    'rejects expiresIn %p',
    async (expiresIn) => {
      await expect(invalidProperties({ expiresIn })).resolves.toContain(
        'expiresIn',
      );
    },
  );
});
