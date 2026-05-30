import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionLoggingFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const responseBody = exception.getResponse();
    const message = this.getMessage(responseBody);

    this.logger.warn(
      `[HTTP ${status}] ${req.method} ${req.originalUrl} ip=${req.ip || 'unknown-ip'} message="${message}"`,
    );

    res.status(status).json(
      typeof responseBody === 'string'
        ? {
            statusCode: status,
            message: responseBody,
          }
        : responseBody,
    );
  }

  private getMessage(responseBody: string | object): string {
    if (typeof responseBody === 'string') return responseBody;

    const message = (responseBody as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;

    return 'HTTP exception';
  }
}
