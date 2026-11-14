import { INestApplication } from "@nestjs/common";
import { json, NextFunction, Request, Response } from "express";

export const IDENTIFICATION_PATH = "/api/v1/catalog/identification-requests";
/** `PUT|DELETE /{request_id}/photo`: an opaque binary read as a stream. */
export const IDENTIFICATION_PHOTO_PATH = /^\/api\/v1\/catalog\/identification-requests\/[0-9a-f-]{36}\/photo$/i;
/** `PUT /{request_id}`: the request data (small JSON). */
const IDENTIFICATION_DATA_PATH = /^\/api\/v1\/catalog\/identification-requests\/[0-9a-f-]{36}$/i;
export const IDENTIFICATION_MAX_JSON_BYTES = 8 * 1024;

/**
 * Body handling of `/api/v1/catalog/identification-requests` (E1 §4), before
 * Nest's own parsers (i.e. before `app.init()` / `app.listen()`):
 *
 * - Photo routes: Nest's JSON and urlencoded parsers must never read the
 *   image. A body of any media type other than `application/octet-stream` is
 *   answered here with the closed 415, without reading it (as
 *   `configureBackupsBodyGuard`).
 * - Data route: the JSON body is parsed here with a small limit; a malformed
 *   or oversized body is left unparsed, so the DTO validation answers the
 *   closed 400 PAYLOAD_INVALID and no parser message (which may quote the
 *   body) reaches the response or the logs.
 */
export function configureProductIdentificationBody(app: INestApplication): void {
  const parser = json({ limit: IDENTIFICATION_MAX_JSON_BYTES });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    if (IDENTIFICATION_PHOTO_PATH.test(path)) {
      const length = req.headers["content-length"];
      const hasBody =
        req.headers["transfer-encoding"] !== undefined || (length !== undefined && length !== "0");
      const mediaType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
      if (!hasBody || mediaType === "application/octet-stream") {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Connection", "close");
      res.status(415).json({ errorCode: "UNSUPPORTED_MEDIA_TYPE" });
      return;
    }
    if (IDENTIFICATION_DATA_PATH.test(path)) {
      parser(req, res, (error?: unknown) => {
        if (error) req.body = undefined;
        next();
      });
      return;
    }
    next();
  });
}
