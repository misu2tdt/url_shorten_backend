import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { GlobalExceptionFilter } from './http-exception.filter';

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();
  let json: jest.Mock;
  let status: jest.Mock;

  function run(exception: unknown) {
    const host = new ExecutionContextHost([{}, { status }, jest.fn()]);
    filter.catch(exception, host);
  }

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
  });

  it('keeps the status and a string message of an HttpException', () => {
    run(new HttpException('plain failure', 418));

    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 418, message: 'plain failure' }),
    );
  });

  it('uses message and error from an object response', () => {
    run(new BadRequestException('bad input'));

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: 'bad input',
      }),
    );
  });

  it('passes an array of validation messages through unchanged', () => {
    run(new BadRequestException(['a must be x', 'b must be y']));

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: ['a must be x', 'b must be y'],
      }),
    );
  });

  it('formats the exceptions the service throws (Nest exception with a message)', () => {
    run(new NotFoundException('Link not found'));

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        message: 'Link not found',
      }),
    );
  });

  it('falls back to the exception message and a generic error label for an object without them', () => {
    run(new HttpException({ foo: 1 }, 409));

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        error: 'Error',
        message: 'Http Exception',
      }),
    );
  });

  it('always adds an ISO timestamp', () => {
    run(new NotFoundException());

    const [body] = json.mock.calls[0] as [{ timestamp: string }];
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('turns an unknown error into a generic 500 without leaking its message', () => {
    run(new Error('connection to db at 10.0.0.5 failed, password=hunter2'));

    expect(status).toHaveBeenCalledWith(500);
    const [body] = json.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('turns a non-Error throw into a generic 500', () => {
    run('something odd');

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
  });

  // Known quirk, not fixed in this task: a string-bodied HttpException keeps
  // the 500 label ("Internal Server Error") in `error`.
  it.todo(
    'KNOWN BUG: error label of a string-bodied HttpException should match its status',
  );
});
