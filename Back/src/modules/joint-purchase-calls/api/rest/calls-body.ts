import { INestApplication } from "@nestjs/common";
import { json, NextFunction, Request, Response } from "express";

/** Institutional and farmer routes of E2 (§4.1, §4.2). */
export const CALLS_PATH = /^\/api\/v1\/(me\/)?joint-purchase-calls(\/|$)/;
export const CALLS_MAX_JSON_BYTES = 16 * 1024;

/**
 * Body handling of the E2 routes, before Nest's own parsers (i.e. before
 * `app.init()` / `app.listen()`), as E1 does: the JSON body is parsed here
 * with a small limit; a malformed or oversized body is left unparsed, so the
 * DTO validation answers the closed 400 PAYLOAD_INVALID and no parser message
 * (which may quote the body) reaches the response or the logs.
 */
export function configureJointPurchaseCallsBody(app: INestApplication): void {
  const parser = json({ limit: CALLS_MAX_JSON_BYTES });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!CALLS_PATH.test(req.path)) {
      next();
      return;
    }
    parser(req, res, (error?: unknown) => {
      if (error) req.body = undefined;
      next();
    });
  });
}
