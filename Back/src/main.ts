import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import cookieParser = require("cookie-parser");
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionLoggingFilter } from "./bootstrap/http-exception-logging.filter";
import { createOpenApiDocument } from "./bootstrap/openapi";
import { configureBackupsBodyGuard } from "./modules/backups/api/rest/backups-body";
import { configureJointPurchaseCallsBody } from "./modules/joint-purchase-calls/api/rest/calls-body";
import { configureProductIdentificationBody } from "./modules/product-identification/api/rest/identification-body";
import { configureSyncV1BodyParser } from "./modules/sync-v1/api/rest/sync-v1-body";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api/v1");
  // Before Nest's own JSON parser: Sync v1 bodies are parsed strictly.
  configureSyncV1BodyParser(app);
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionLoggingFilter());
  app.enableCors({
    origin: config.get<string>("CORS_ORIGIN")?.split(",") ?? true,
    credentials: true,
  });
  // F08: the backup body is a stream; no shared parser may read or echo it.
  // After helmet and CORS (its 415 carries their headers) and still before
  // Nest's own parsers, which are registered on init.
  configureBackupsBodyGuard(app);
  // E1: the label photo is a stream (same rule as F08) and the request data
  // is parsed without echoing a malformed body.
  configureProductIdentificationBody(app);
  // E2: JSON bodies of the joint purchase calls parsed without echoing a
  // malformed body (same rule as E1).
  configureJointPurchaseCallsBody(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const document = createOpenApiDocument(app);
  SwaggerModule.setup("docs", app, document);

  await app.listen(config.get<number>("PORT") ?? 3000);
}

void bootstrap();
