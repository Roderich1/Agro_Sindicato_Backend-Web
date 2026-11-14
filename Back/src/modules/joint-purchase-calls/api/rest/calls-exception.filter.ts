import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Response } from "express";
import { SyncV1HttpError } from "@/modules/sync-v1/application/sync-v1-http-error";
import { CallErrorCode, CallHttpError } from "../../domain/call-error";

const BY_STATUS: Record<number, CallErrorCode> = {
  400: "PAYLOAD_INVALID",
  401: "AUTH_REQUIRED",
  403: "AUTH_CONTEXT_FORBIDDEN",
  404: "CALL_NOT_FOUND",
  413: "PAYLOAD_INVALID",
  429: "RATE_LIMITED",
};

/**
 * Closed body `{ errorCode, … }` and `Cache-Control: no-store` for every
 * failure of the E2 routes (contract §4). Nothing from the request (body,
 * names, quantities, ids) is echoed or logged: only the status and the code.
 */
@Catch()
export class CallsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("JointPurchaseCalls");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: Record<string, unknown> = { errorCode: "TEMPORARILY_UNAVAILABLE" };
    if (exception instanceof CallHttpError) {
      status = exception.status;
      body = exception.body();
      for (const [name, value] of Object.entries(exception.headers)) response.setHeader(name, value);
    } else if (exception instanceof SyncV1HttpError) {
      // The farmer's authentication (SyncV1AuthGuard): 401 or 403, with its WWW-Authenticate.
      status = exception.status;
      body = { errorCode: BY_STATUS[status] ?? "TEMPORARILY_UNAVAILABLE" };
      for (const [name, value] of Object.entries(exception.headers)) response.setHeader(name, value);
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      body = { errorCode: "RATE_LIMITED" };
    } else if (exception instanceof HttpException && BY_STATUS[exception.getStatus()]) {
      status = exception.getStatus();
      body = { errorCode: BY_STATUS[status] };
    } else {
      this.logger.error(
        `Joint purchase calls unexpected failure (${exception instanceof Error ? exception.name : typeof exception})`,
      );
    }
    if (response.headersSent) {
      response.destroy();
      return;
    }
    if (status >= 400 && status < 500) {
      this.logger.warn(`Joint purchase calls request rejected status=${status} code=${String(body["errorCode"])}`);
    }
    response.setHeader("Cache-Control", "no-store");
    response.status(status).json(body);
  }
}
