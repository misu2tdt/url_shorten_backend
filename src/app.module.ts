import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; 
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UrlsModule } from './urls/urls.module';
import { Url } from './urls/entities/url.entity'; 

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost', 
      port: 5433, // Cổng của Docker
      username: 'postgres', 
      password: '123456', // Pass siêu bảo mật
      database: 'postgres', // Dùng luôn database mặc định
      entities: [Url], 
      synchronize: true, 
    }),
    UrlsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}