import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from './configure-app';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ShortenUrlDto } from './urls/dto/shorten-url.dto';

describe('configureApp', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication();
  });

  it('registers the global GlobalExceptionFilter and enables CORS', () => {
    const useFilters = jest.spyOn(app, 'useGlobalFilters');
    const enableCors = jest.spyOn(app, 'enableCors');

    configureApp(app);

    expect(useFilters).toHaveBeenCalledTimes(1);
    expect(useFilters.mock.calls[0][0]).toBeInstanceOf(GlobalExceptionFilter);
    expect(enableCors).toHaveBeenCalledTimes(1);
    expect(enableCors).toHaveBeenCalledWith();
  });

  describe('global ValidationPipe', () => {
    async function transformBody(body: object): Promise<unknown> {
      const useGlobalPipes = jest.spyOn(app, 'useGlobalPipes');
      configureApp(app);
      expect(useGlobalPipes).toHaveBeenCalledTimes(1);
      const pipe = useGlobalPipes.mock.calls[0][0];
      const transformed: unknown = await pipe.transform(body, {
        type: 'body',
        metatype: ShortenUrlDto,
      });
      return transformed;
    }

    it('strips unknown fields (whitelist) and returns a DTO instance (transform)', async () => {
      const result = await transformBody({
        originalUrl: 'https://google.com',
        customAlias: 'my-link',
        isActive: false,
        clickCount: 999,
        id: 1,
      });

      expect(result).toBeInstanceOf(ShortenUrlDto);
      expect(result).toEqual({
        originalUrl: 'https://google.com',
        customAlias: 'my-link',
      });
    });

    it('rejects an invalid body with a 400 listing the messages', async () => {
      const failure = transformBody({ originalUrl: 'javascript:alert(1)' });

      await expect(failure).rejects.toBeInstanceOf(BadRequestException);
      await expect(failure).rejects.toMatchObject({
        response: {
          statusCode: 400,
          message: ['Must be a valid URL (e.g. https://google.com)'],
        },
      });
    });
  });
});
