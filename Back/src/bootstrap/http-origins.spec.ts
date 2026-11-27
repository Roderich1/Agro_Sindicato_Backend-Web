import { ConfigService } from "@nestjs/config";
import { httpOrigins } from "./http-origins";

describe("HTTP configuration for production", () => {
  const production = (origin: string, secure = true) => new ConfigService({
    NODE_ENV: "production", COOKIE_SECURE: secure, CORS_ORIGIN: origin,
  });

  it("allows only the explicitly configured HTTPS origins", () => {
    expect(httpOrigins(production("https://web.example.invalid, https://preview.example.invalid")))
      .toEqual(["https://web.example.invalid", "https://preview.example.invalid"]);
    for (const value of ["*", "", "http://web.example.invalid", "https://web.example.invalid/path", "https://user@web.example.invalid"]) {
      expect(() => httpOrigins(production(value))).toThrow("explicit HTTPS origins");
    }
  });

  it("requires secure cookies in production and preserves the local origin", () => {
    expect(() => httpOrigins(production("https://web.example.invalid", false))).toThrow("COOKIE_SECURE=true");
    expect(httpOrigins(new ConfigService({ NODE_ENV: "development" }))).toEqual(["http://localhost:5173"]);
  });
});
