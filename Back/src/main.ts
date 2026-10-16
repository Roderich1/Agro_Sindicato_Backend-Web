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
import { configureSyncV1BodyParser } from "./modules/sync-v1/api/rest/sync-v1-body";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api/v1");
  // Before Nest's own JSON parser: Sync v1 bodies are parsed strictly.
  configureSyncV1BodyParser(app);
  app.use(helmet());
  app.use(cookieParser());
  // F08: the backup body is a stream; no shared parser may read or echo it.
  // Still before Nest's own parsers, which are registered on init.
  configureBackupsBodyGuard(app);
  app.useGlobalFilters(new HttpExceptionLoggingFilter());
  app.enableCors({
    origin: config.get<string>("CORS_ORIGIN")?.split(",") ?? true,
    credentials: true,
  });
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
