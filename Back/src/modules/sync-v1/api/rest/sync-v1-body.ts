import { INestApplication } from "@nestjs/common";
import { NextFunction, raw, Request, Response } from "express";
import { TextDecoder } from "node:util";
import { parseStrictJson, StrictJsonValue } from "../../domain/strict-json";
import { SyncV1HttpError } from "../../application/sync-v1-http-error";

/** Operational limit of one v1 envelope (#17); a valid one is far smaller. */
export const SYNC_V1_MAX_BODY_BYTES = 16 * 1024;
export const SYNC_V1_PATH = "/api/v1/sync/v1";

type BodyError = { type?: string };
type SyncV1BodyRequest = Request & { syncV1BodyError?: BodyError };

/**
 * Sync v1 bodies are read as raw bytes and parsed strictly (duplicate keys,
 * raw numbers): the shared JSON parser would silently keep the last duplicate.
 * Must be registered before the application's own body parser, i.e. before
 * `app.init()` / `app.listen()`.
 */
export function configureSyncV1BodyParser(app: INestApplication): void {
  const parser = raw({ type: () => true, limit: SYNC_V1_MAX_BODY_BYTES });
  app.use(SYNC_V1_PATH, (req: Request, res: Response, next: NextFunction) => {
    parser(req, res, (error?: unknown) => {
      // Reported by the controller with the contract's body, never as HTML.
      if (error) (req as SyncV1BodyRequest).syncV1BodyError = error as BodyError;
      next();
    });
  });
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** 413 / 415 / 400 before any business processing (contract §9). */
export function readSyncV1Body(request: Request): StrictJsonValue {
  const bodyError = (request as SyncV1BodyRequest).syncV1BodyError;
  if (bodyError) {
    throw bodyError.type === "entity.too.large"
      ? new SyncV1HttpError(413, "REQUEST_TOO_LARGE")
      : new SyncV1HttpError(400, "INVALID_REQUEST");
  }
  const contentType = request.headers["content-type"] ?? "";
  const charset = /;\s*charset=([^;\s]+)/i.exec(contentType)?.[1];
  if (
    !request.is("application/json") ||
    (charset !== undefined && charset.toLowerCase() !== "utf-8")
  ) {
    throw new SyncV1HttpError(415, "UNSUPPORTED_MEDIA_TYPE");
  }
  if (!Buffer.isBuffer(request.body) || request.body.length === 0)
    throw new SyncV1HttpError(400, "INVALID_REQUEST");
  try {
    const text = decoder.decode(request.body);
    if (text.charCodeAt(0) === 0xfeff) throw new Error("BOM");
    return parseStrictJson(text);
  } catch {
    throw new SyncV1HttpError(400, "INVALID_REQUEST");
  }
}
