// F12-EST-09 (#182): escribe los conjuntos sintéticos S1–S6 fijados antes de medir.
// Se ejecuta desde Back/ (usa ts-node del backend). Solo datos sintéticos.
//
//   node ../docs/evidence/f12_est_09/generar-conjuntos.cjs <salida.json>
const { createRequire } = require("node:module");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const req = createRequire(resolve(process.cwd(), "package.json"));
req("ts-node/register/transpile-only");
req("tsconfig-paths/register");
const { generateSets } = req("./src/modules/estimation/test-support/evaluation/synthetic-sets");

const out = process.argv[2];
if (!out) throw new Error("falta la ruta de salida");
writeFileSync(out, `${JSON.stringify(generateSets(), null, 2)}\n`);
