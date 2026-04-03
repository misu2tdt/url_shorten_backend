import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Url } from './entities/url.entity';

@Injectable()
export class UrlsService {
  // 1. Tiêm công cụ tương tác Database (Repository) vào Service
  constructor(
    @InjectRepository(Url)
    private urlRepository: Repository<Url>,
  ) {}

  private generateShortCode(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  // 2. Chuyển thành hàm async (bất đồng bộ) vì giao tiếp DB tốn thời gian
  async shortenUrl(originalUrl: string) {
    let shortCode = this.generateShortCode();

    // 3. Tạo một bản ghi mới bằng TypeORM
    const newUrl = this.urlRepository.create({
      originalUrl: originalUrl,
      shortCode: shortCode,
    });

    // 4. Lưu vào Database thật
    await this.urlRepository.save(newUrl);

    return {
      originalUrl,
      shortCode,
      shortUrl: `http://localhost:3000/urls/${shortCode}`,
    };
  }

  // 5. Hàm tìm kiếm cũng phải đợi DB trả kết quả (async/await)
  async getOriginalUrl(shortCode: string): Promise<string> {
    const urlRecord = await this.urlRepository.findOne({
      where: { shortCode: shortCode },
    });

    if (!urlRecord) {
      throw new NotFoundException('Không tìm thấy đường dẫn này!');
    }

    return urlRecord.originalUrl; // Trả về link gốc nằm trong bản ghi DB
  }
}