import { Module } from '@nestjs/common';
import { UrlsService } from './urls.service';
import { UrlsController } from './urls.controller';
import { TypeOrmModule } from '@nestjs/typeorm'; 
import { Url } from './entities/url.entity'; // Import Entity

@Module({
  // Cấp quyền cho module này xài bảng Url
  imports: [TypeOrmModule.forFeature([Url])], 
  controllers: [UrlsController],
  providers: [UrlsService],
})
export class UrlsModule {}
