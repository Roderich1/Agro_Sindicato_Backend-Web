import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Agrochemical Inventory API")
    .setDescription(
      "API central de identidad, membresia, contratos autorizados, campanas y catalogos compartidos, con autenticacion versionada. Algunos endpoints legacy permanecen por compatibilidad; su presencia en OpenAPI no los convierte en arquitectura target del Proyecto de Grado.",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .addCookieAuth(
      "refresh_token",
      { type: "apiKey", in: "cookie", name: "refresh_token" },
      "refresh_token",
    )
    .addCookieAuth(
      "refresh_token_v2",
      { type: "apiKey", in: "cookie", name: "refresh_token_v2" },
      "refresh_token_v2",
    )
    .build();
  return SwaggerModule.createDocument(app, config);
}
