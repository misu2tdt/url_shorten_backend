import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.enableCors();

  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT') || 3000;

  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
}

bootstrap();