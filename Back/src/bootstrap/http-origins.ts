import { ConfigService } from "@nestjs/config";

export function httpOrigins(config: ConfigService): string[] {
  const origins = (config.get<string>("CORS_ORIGIN") ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (config.get<string>("NODE_ENV") !== "production") return origins;

  if (config.get<boolean>("COOKIE_SECURE") !== true) {
    throw new Error("Production requires COOKIE_SECURE=true.");
  }
  if (!origins.length || !origins.every(httpsOrigin)) {
    throw new Error("Production requires explicit HTTPS origins in CORS_ORIGIN.");
  }
  return origins;
}

function httpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  } catch {
    return false;
  }
}
