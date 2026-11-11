import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Response } from "express";
import { SyncV1HttpError } from "@/modules/sync-v1/application/sync-v1-http-error";
import { IdentificationErrorCode, IdentificationHttpError } from "../../domain/identification-error";

const BY_STATUS: Record<number, IdentificationErrorCode> = {
  400: "PAYLOAD_INVALID",
  401: "AUTH_REQUIRED",
  403: "AUTH_CONTEXT_FORBIDDEN",
  404: "REQUEST_NOT_FOUND",
  413: "IMAGE_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "RATE_LIMITED",
};

/**
 * Closed body `{ errorCode }` and `Cache-Control: no-store` for every failure
 * of `/api/v1/catalog/identification-requests` (E1 §4). Nothing from the
 * request (body, names, ids, headers, image bytes) is echoed or logged: only
 * the status and the code.
 */
@Catch()
export class IdentificationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ProductIdentification");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let code: IdentificationErrorCode = "TEMPORARILY_UNAVAILABLE";
    if (exception instanceof IdentificationHttpError) {
      status = exception.status;
      code = exception.errorCode;
      for (const [name, value] of Object.entries(exception.headers)) response.setHeader(name, value);
    } else if (exception instanceof SyncV1HttpError) {
      // The farmer's authentication (SyncV1AuthGuard): 401 AUTH_REQUIRED or
      // 403 AUTH_CONTEXT_FORBIDDEN, with its WWW-Authenticate header.
      status = exception.status;
      code = BY_STATUS[status] ?? "TEMPORARILY_UNAVAILABLE";
      for (const [name, value] of Object.entries(exception.headers)) response.setHeader(name, value);
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      code = "RATE_LIMITED";
    } else if (exception instanceof HttpException && BY_STATUS[exception.getStatus()]) {
      status = exception.getStatus();
      code = BY_STATUS[status];
    } else {
      this.logger.error(
        `Product identification unexpected failure (${exception instanceof Error ? exception.name : typeof exception})`,
      );
    }
    if (response.headersSent) {
      response.destroy();
      return;
    }
    if (status >= 400 && status < 500) {
      this.logger.warn(`Product identification request rejected status=${status} code=${code}`);
    }
    response.setHeader("Cache-Control", "no-store");
    response.status(status).json({ errorCode: code });
  }
}
