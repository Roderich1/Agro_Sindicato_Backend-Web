import { INestApplication } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

export const BACKUPS_PATH = "/api/v1/me/backups";

/**
 * The backup body is an opaque binary read as a stream by the upload route.
 * Nest's shared JSON and urlencoded parsers must never read it: they would
 * answer with fragments of the body and log them. A request to this path that
 * carries a body of any other media type is answered here with the closed
 * 415, before any parser runs and without reading the body.
 *
 * Must be registered before the application's own body parsers, i.e. before
 * `app.init()` / `app.listen()` (as `configureSyncV1BodyParser`).
 */
export function configureBackupsBodyGuard(app: INestApplication): void {
  app.use(BACKUPS_PATH, (req: Request, res: Response, next: NextFunction) => {
    const length = req.headers["content-length"];
    const hasBody =
      req.headers["transfer-encoding"] !== undefined ||
      (length !== undefined && length !== "0");
    const mediaType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
    if (!hasBody || mediaType === "application/octet-stream") {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "close");
    res.status(415).json({ errorCode: "UNSUPPORTED_MEDIA_TYPE" });
  });
}
