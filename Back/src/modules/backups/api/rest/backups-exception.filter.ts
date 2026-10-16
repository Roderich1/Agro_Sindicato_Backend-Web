import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Response } from "express";
import {
  BackupErrorCode,
  BackupHttpError,
} from "../../application/backup-http-error";

const BY_STATUS: Record<number, BackupErrorCode> = {
  400: "INVALID_REQUEST",
  401: "AUTH_REQUIRED",
  403: "AUTH_CONTEXT_FORBIDDEN",
  404: "BACKUP_NOT_FOUND",
  413: "BACKUP_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "RATE_LIMITED",
};

/**
 * Closed body `{ errorCode }` and `Cache-Control: no-store` for every failure
 * of `/api/v1/me/backups`. Nothing from the request (body, ids, headers) is
 * echoed or logged: only the status and the code.
 */
@Catch()
export class BackupsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Backups");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let code: BackupErrorCode = "BACKUP_STORAGE_UNAVAILABLE";
    if (exception instanceof BackupHttpError) {
      status = exception.status;
      code = exception.errorCode;
      for (const [name, value] of Object.entries(exception.headers))
        response.setHeader(name, value);
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      code = "RATE_LIMITED";
    } else if (exception instanceof HttpException && BY_STATUS[exception.getStatus()]) {
      status = exception.getStatus();
      code = BY_STATUS[status];
    } else {
      this.logger.error(
        `Backups unexpected failure (${exception instanceof Error ? exception.name : typeof exception})`,
      );
    }
    if (response.headersSent) {
      // Failure while streaming a download: the client gets a truncated body
      // and its own SHA-256 check rejects it.
      response.destroy();
      return;
    }
    if (status >= 400 && status < 500)
      this.logger.warn(`Backups request rejected status=${status} code=${code}`);
    response.setHeader("Cache-Control", "no-store");
    response.status(status).json({ errorCode: code });
  }
}
