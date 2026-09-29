require("ts-node/register");
require("tsconfig-paths/register");
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../src/app.module");
const { createOpenApiDocument } = require("../src/bootstrap/openapi");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    app.setGlobalPrefix("api/v1");
    await app.init();
    const spec = `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`;
    const target = resolve(__dirname, "../../docs/api/openapi-f02.json");
    if (process.argv.includes("--check")) {
      if (readFileSync(target, "utf8") !== spec) {
        throw new Error("OpenAPI drift: run npm run openapi:generate and review the diff");
      }
      process.stdout.write("OpenAPI snapshot matches generated document.\n");
    } else {
      const output = process.argv[2] && !process.argv[2].startsWith("--")
        ? resolve(process.argv[2]) : target;
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, spec, "utf8");
      process.stdout.write(`Generated ${output}\n`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
