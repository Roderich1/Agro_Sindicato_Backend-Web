import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Response } from "express";
import { RequestErrorCode, requestError } from "../../domain/ack";
import { SyncV1HttpError } from "../../application/sync-v1-http-error";

const BY_STATUS: Record<number, RequestErrorCode> = {
  400: "INVALID_REQUEST",
  401: "AUTH_REQUIRED",
  403: "AUTH_CONTEXT_FORBIDDEN",
  404: "OPERATION_NOT_FOUND",
  413: "REQUEST_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "RATE_LIMITED",
  503: "TEMPORARILY_UNAVAILABLE",
};

/**
 * Every Sync v1 request failure gets the closed body of contract §9 and
 * `Cache-Control: no-store`. Nothing from the request (body, values, field
 * names, headers) is echoed or logged; only the status and error code.
 */
@Catch()
export class SyncV1ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("SyncV1");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    // A 500 carries no reliable ACK: Mobile keeps the intention (OUTCOME_UNKNOWN).
    let code: RequestErrorCode = "TEMPORARILY_UNAVAILABLE";
    if (exception instanceof SyncV1HttpError) {
      status = exception.status;
      code = exception.errorCode;
      for (const [name, value] of Object.entries(exception.headers))
        response.setHeader(name, value);
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      code = "RATE_LIMITED";
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = BY_STATUS[status] ?? "TEMPORARILY_UNAVAILABLE";
      if (!BY_STATUS[status]) status = 500;
    } else {
      this.logger.error(
        `Sync v1 unexpected failure (${exception instanceof Error ? exception.name : typeof exception})`,
      );
    }
    if (status >= 400 && status < 500) {
      this.logger.warn(`Sync v1 request rejected status=${status} code=${code}`);
    }
    response.setHeader("Cache-Control", "no-store");
    response.status(status).json(requestError(code));
  }
}
