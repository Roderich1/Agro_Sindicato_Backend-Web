import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REVIEWED_F02_C_FILES = [
  ".env.example",
  "prisma/migrations/20260924143000_f02_add_auth_session_v2/migration.sql",
  "prisma/schema.prisma",
  "src/config/duration.spec.ts",
  "src/config/duration.ts",
  "src/config/env.schema.ts",
  "src/main.ts",
  "src/modules/iam/api/rest/auth-v2.controller.spec.ts",
  "src/modules/iam/api/rest/auth-v2.controller.ts",
  "src/modules/iam/api/rest/auth.controller.ts",
  "src/modules/iam/application/dtos/auth-v2.dto.ts",
  "src/modules/iam/application/services/auth-ttl-policy.ts",
  "src/modules/iam/application/services/auth-v2-utf8.spec.ts",
  "src/modules/iam/application/services/auth-v2.postgres.spec.ts",
  "src/modules/iam/application/services/auth-v2.service.ts",
  "src/modules/iam/application/types/jwt-payload.type.ts",
  "src/modules/iam/application/use-cases/login.use-case.ts",
  "src/modules/iam/application/use-cases/logout.use-case.ts",
  "src/modules/iam/application/use-cases/refresh-session.use-case.spec.ts",
  "src/modules/iam/application/use-cases/refresh-session.use-case.ts",
  "src/modules/iam/domain/ports/refresh-token.repository.port.ts",
  "src/modules/iam/iam.module.ts",
  "src/modules/iam/infrastructure/persistence/prisma-client-registration.repository.spec.ts",
  "src/modules/iam/infrastructure/persistence/prisma-client-registration.repository.ts",
  "src/modules/iam/infrastructure/persistence/prisma-refresh-token.repository.ts",
  "../docs/evidence/F02_IAM_03.md",
] as const;

const SUSPICIOUS_UTF8_PREFIXES = [0x00c3, 0x00c2, 0x00e2, 0xfffd].map(
  (codePoint) => String.fromCodePoint(codePoint),
);

describe("F02-C UTF-8 integrity", () => {
  it("contains no mojibake in reviewed source and evidence files", () => {
    const findings = REVIEWED_F02_C_FILES.flatMap((file) => {
      const content = readFileSync(resolve(process.cwd(), file), "utf8");
      return SUSPICIOUS_UTF8_PREFIXES.filter((marker) =>
        content.includes(marker),
      ).map((marker) => `${file}: U+${marker.codePointAt(0)?.toString(16)}`);
    });

    expect(findings).toEqual([]);
  });
});
