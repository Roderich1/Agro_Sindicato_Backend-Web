// F12-EST-09 (#182): evaluación con origen móvil del motor integrado sobre los
// conjuntos versionados. Se ejecuta desde Back/. Escribe el JSON completo y un
// informe Markdown con las tablas por origen y por conjunto.
//
//   node ../docs/evidence/f12_est_09/evaluar.cjs <resultados.json> <resultados.md>
const { createRequire } = require("node:module");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const req = createRequire(resolve(process.cwd(), "package.json"));
req("ts-node/register/transpile-only");
req("tsconfig-paths/register");
const { generateSets } = req("./src/modules/estimation/test-support/evaluation/synthetic-sets");
const { evaluate } = req("./src/modules/estimation/test-support/evaluation/rolling-origin");

const [jsonOut, mdOut] = process.argv.slice(2);
if (!jsonOut || !mdOut) throw new Error("faltan las rutas de salida");

// Los conjuntos se leen del archivo versionado y se comprueba que el generador da lo mismo.
const versioned = readFileSync(resolve(__dirname, "conjuntos.json"), "utf8").replace(/\r\n/g, "\n");
const sets = generateSets();
if (`${JSON.stringify(sets, null, 2)}\n` !== versioned) throw new Error("los conjuntos generados no coinciden con conjuntos.json");

const report = evaluate(sets);
writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);

const STATUS = { EVALUATED: "evaluado", NOT_ESTIMABLE: "no estimable", NOT_EVALUABLE: "no evaluable" };
const cell = (v) => (v === null || v === undefined ? "—" : String(v));
const measure = (m) => (m.percent ? `${m.value} (${m.percent} %)` : m.value);
const lines = [
  "# F12-EST-09: resultados por origen y por conjunto",
  "",
  `Evaluación \`${report.evaluationVersion}\`, conjuntos \`${report.setsVersion}\`, método \`${report.methodVersion}\`. Cantidades en la unidad base (mL o g); MAE con 6 decimales y también en L o KG; WAPE como proporción y porcentaje. Datos sintéticos: no acreditan precisión real.`,
  "",
  "## Por conjunto",
  "",
  "| Conjunto | Unidad | Orígenes evaluados / no estimables / no evaluables | MAE SES | MAE naive | WAPE SES | WAPE naive | Comparación (MAE) | Campaña siguiente |",
  "|---|---|---|---|---|---|---|---|---|",
];
for (const s of report.sets) {
  const unit = s.baseUnit === "ML" ? "mL" : "g";
  const mae = (m, p) => (p ? `${m.value} ${unit} (${p} ${s.presentationUnit})` : m.value);
  const next = s.next.assessment.status === "READY" ? `SES ${s.next.ses}, naive ${s.next.naive}, α ${s.next.alpha}` : `${s.next.assessment.status} (${s.next.assessment.reason})`;
  lines.push(
    `| ${s.id} ${s.name} | ${unit} | ${s.evaluated} / ${s.notEstimable} / ${s.notEvaluable} | ${mae(s.mae.ses, s.mae.sesPresentation)} | ${mae(s.mae.naive, s.mae.naivePresentation)} | ${measure(s.wape.ses)} | ${measure(s.wape.naive)} | ${s.comparison} | ${next} |`,
  );
}
for (const s of report.sets) {
  lines.push("", `## ${s.id} ${s.name} (${s.baseUnit === "ML" ? "mL" : "g"})`, "");
  lines.push("| Origen t | Reservada | Estado | Lectura del motor | Ajuste: posiciones → valores | α | SES | Naive | Valor reservado | Error SES | Error naive |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const o of s.origins) {
    const reading = o.assessment.reason ? `${o.assessment.status} (${o.assessment.reason})` : o.assessment.status;
    const fit = o.fit ? `${o.fit.positions[0]}–${o.fit.positions[o.fit.positions.length - 1]} → ${o.fit.values.join(", ")}` : "—";
    const reserved = o.status === "NOT_EVALUABLE" ? `sin valor (${o.reservedKind})` : cell(o.reserved ?? (o.reservedKind !== "VERIFIED_CONSUMPTION" ? `sin valor (${o.reservedKind})` : null));
    lines.push(
      `| ${o.origin} | ${o.reservedPosition} | ${STATUS[o.status]} | ${reading} | ${fit} | ${cell(o.alpha)}${o.fitInformative === false ? " (no informativo)" : ""} | ${cell(o.ses)} | ${cell(o.naive)} | ${reserved} | ${cell(o.errorSes)} | ${cell(o.errorNaive)} |`,
    );
  }
}
writeFileSync(mdOut, `${lines.join("\n")}\n`);
process.stdout.write(`${report.sets.map((s) => `${s.id}: ${s.evaluated} evaluados, MAE SES ${s.mae.ses.value}, MAE naive ${s.mae.naive.value}, ${s.comparison}`).join("\n")}\n`);
