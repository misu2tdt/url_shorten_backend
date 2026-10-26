import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { UrlsController } from './urls.controller';
import { UrlsService } from './urls.service';

describe('UrlsController', () => {
  let controller: UrlsController;

  const service = {
    shortenUrl: jest.fn(),
    getOriginalUrl: jest.fn<Promise<string>, [string, unknown]>(),
    getAllUrls: jest.fn(),
    getUrlStats: jest.fn(),
    updateUrl: jest.fn(),
    deleteUrl: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UrlsController],
      providers: [{ provide: UrlsService, useValue: service }],
    }).compile();

    controller = module.get(UrlsController);
  });

  describe('redirect', () => {
    const redirect = jest.fn();
    const res = { redirect } as Response;

    function makeReq(headers: Record<string, string>, ip?: string): Request {
      return { headers, ip } as Request;
    }

    it('responds 302 with the original URL', async () => {
      service.getOriginalUrl.mockResolvedValue('https://example.com/target');

      await controller.redirect('abc12345', makeReq({}, '10.0.0.1'), res);

      expect(redirect).toHaveBeenCalledTimes(1);
      expect(redirect).toHaveBeenCalledWith(302, 'https://example.com/target');
    });

    it('passes the first x-forwarded-for IP, user agent and referer as tracking data', async () => {
      service.getOriginalUrl.mockResolvedValue('https://example.com');

      await controller.redirect(
        'abc12345',
        makeReq(
          {
            'x-forwarded-for': '203.0.113.5, 10.0.0.2',
            'user-agent': 'jest-agent',
            referer: 'https://ref.example/page',
          },
          '10.0.0.1',
        ),
        res,
      );

      expect(service.getOriginalUrl).toHaveBeenCalledWith('abc12345', {
        ip: '203.0.113.5',
        userAgent: 'jest-agent',
        referrer: 'https://ref.example/page',
      });
    });

    it('falls back to req.ip when there is no x-forwarded-for', async () => {
      service.getOriginalUrl.mockResolvedValue('https://example.com');

      await controller.redirect('abc12345', makeReq({}, '10.0.0.1'), res);

      expect(service.getOriginalUrl).toHaveBeenCalledWith('abc12345', {
        ip: '10.0.0.1',
        userAgent: undefined,
        referrer: undefined,
      });
    });

    it('does not redirect when the service throws', async () => {
      service.getOriginalUrl.mockRejectedValue(new Error('not found'));

      await expect(
        controller.redirect('nope', makeReq({}), res),
      ).rejects.toThrow('not found');
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  describe('delegation', () => {
    it('shorten passes the DTO to the service and returns its result', () => {
      const dto = { originalUrl: 'https://example.com' };
      service.shortenUrl.mockReturnValue('created');

      expect(controller.shorten(dto)).toBe('created');
      expect(service.shortenUrl).toHaveBeenCalledWith(dto);
    });

    it('getAllUrls passes page and limit', () => {
      service.getAllUrls.mockReturnValue('page');

      expect(controller.getAllUrls(3, 25)).toBe('page');
      expect(service.getAllUrls).toHaveBeenCalledWith(3, 25);
    });

    it('getUrlStats passes the short code', () => {
      service.getUrlStats.mockReturnValue('stats');

      expect(controller.getUrlStats('abc12345')).toBe('stats');
      expect(service.getUrlStats).toHaveBeenCalledWith('abc12345');
    });

    it('updateUrl passes the short code and DTO', () => {
      const dto = { originalUrl: 'https://new.example' };
      service.updateUrl.mockReturnValue('updated');

      expect(controller.updateUrl('abc12345', dto)).toBe('updated');
      expect(service.updateUrl).toHaveBeenCalledWith('abc12345', dto);
    });

    it('deleteUrl passes the short code', () => {
      service.deleteUrl.mockReturnValue('deleted');

      expect(controller.deleteUrl('abc12345')).toBe('deleted');
      expect(service.deleteUrl).toHaveBeenCalledWith('abc12345');
    });
  });
});
