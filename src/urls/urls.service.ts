// src/urls/urls.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';


@Injectable()
export class UrlsService {
  
  // Mô phỏng Database tạm thời lưu trên RAM
  private urlDatabase = new Map<string, string>();

  // Hàm tạo mã 6 ký tự (Em giữ nguyên đoạn code nãy em gõ)
  private generateShortCode(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters.charAt(randomIndex);
    }
    return result;
  }

  // Hàm xử lý chính được Controller gọi
  shortenUrl(originalUrl: string) {
    // 1. Tạo ra mã ngắn
    const shortCode = this.generateShortCode();
    
    // 2. Lưu vào Database (tạm thời lưu vào Map)
    // Ví dụ: key là 'aB3x9Z', value là 'https://google.com'
    this.urlDatabase.set(shortCode, originalUrl);

    // 3. Trả kết quả về cho Controller
    return {
      originalUrl: originalUrl,
      shortCode: shortCode,
      shortUrl: `http://localhost:3000/${shortCode}`
    };
  }
  getOriginalUrl(shortCode: string): string {
    const originalUrl = this.urlDatabase.get(shortCode);
    
    // Nếu mã không tồn tại trong Map, quăng lỗi 404 Not Found
    if (!originalUrl) {
      throw new NotFoundException('Không tìm thấy đường dẫn này!');
    }
    
    return originalUrl;
  }
}