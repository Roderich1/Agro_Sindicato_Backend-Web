// F07-POL-01 (#107): resume los k<K>.json de f07-pol-01-k-comparison.postgres.spec.ts en tablas Markdown.
// Sólo lee los archivos de resultados; no contacta ningún servicio.
//   node tool/f07_k_comparison/resumir.cjs <dir-con-k3.json-y-k5.json> [k...]
const fs = require("node:fs");
const path = require("node:path");

const dir = process.argv[2];
const ks = (process.argv.length > 3 ? process.argv.slice(3) : ["3", "5"]).map(Number);
if (!dir) {
  console.error("uso: node resumir.cjs <dir> [k...]");
  process.exit(2);
}
const runs = ks.map((k) => JSON.parse(fs.readFileSync(path.join(dir, `k${k}.json`), "utf8")));
const sum = (rows, key) => rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
const litres = (ml) => (Number(ml) / 1000).toLocaleString("es-BO");
const at = (scenario, step) => ({
  reads: scenario.reads.filter((r) => r.step === step),
  proposals: scenario.proposals.filter((p) => p.step === step),
});

console.log("| Escenario | Origen | Vinculados (inicio → E5) | Aportantes | k | Celdas E1: publicadas / bajo umbral | Propuesta E1: líneas con cifra · litros cubiertos de los declarados | Celdas E5: publicadas / bajo umbral / en revisión · retiradas acumuladas | Propuesta E5: líneas con cifra · litros cubiertos | Publicadas con exactamente k (E1) | Inconsistencias |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const ids = runs[0].scenarios.map((s) => s.id);
for (const id of ids) {
  for (const run of runs) {
    const s = run.scenarios.find((x) => x.id === id);
    const e1 = at(s, "E1_PUBLICAR");
    const e5 = at(s, "E5_CAMBIO_ROL");
    // Vinculados es un valor por campaña (igual en todas): no se suma entre campañas.
    const linkedEnd = e5.reads[0]?.linked_members;
    const p1 = `${sum(e1.proposals, "lines_with_figure")}/${sum(e1.proposals, "lines")} · ${litres(sum(e1.proposals, "covered_ml"))} de ${litres(sum(e1.proposals, "declared_ml"))} L`;
    const p5 = `${sum(e5.proposals, "lines_with_figure")}/${sum(e5.proposals, "lines")} · ${litres(sum(e5.proposals, "covered_ml"))} de ${litres(sum(e5.proposals, "declared_ml"))} L`;
    console.log(
      `| ${s.id} | ${s.origin === "FIXTURE" ? "fixture" : "supuesto sintético"} | ${s.linked_initial} → ${linkedEnd} | ${s.contributing_initial} | ${run.meta.k} | ` +
        `${sum(e1.reads, "disclosed")} / ${sum(e1.reads, "suppressed_under_threshold")} de ${sum(e1.reads, "cells")} | ${p1} | ` +
        `${sum(e5.reads, "disclosed")} / ${sum(e5.reads, "suppressed_under_threshold")} / ${sum(e5.reads, "suppressed_revision")} de ${sum(e5.reads, "cells")} · ${sum(e5.reads, "withdrawn_total")} | ${p5} | ` +
        `${sum(e1.reads, "published_with_exactly_k")} | ${s.failures.length} |`,
    );
  }
}
console.log("");
// Cobertura, celdas suprimidas y pendientes por paso; por campaña separadas con «;» (no se suman personas entre campañas).
const STEPS = ["E1_PUBLICAR", "E2_SUSTITUIR", "E3_ASOCIAR", "E4_BAJA", "E5_CAMBIO_ROL"];
const perCampaign = (rows, f) => rows.map(f).join("; ");
console.log("| Escenario | k | Distribución de aportantes por celda en E1 | " + STEPS.map((s) => `${s.slice(0, 2)}: con cifra de vinculados · suprimidas · pendientes`).join(" | ") + " |");
console.log("|---|---|---|" + STEPS.map(() => "---").join("|") + "|");
for (const id of ids) {
  for (const run of runs) {
    const s = run.scenarios.find((x) => x.id === id);
    const e1 = s.reads.filter((r) => r.step === STEPS[0]);
    const dist = perCampaign(e1, (r) => r.distribution.map((d) => d.members).join("-"));
    const cols = STEPS.map((step) =>
      perCampaign(s.reads.filter((r) => r.step === step), (r) =>
        `${r.members_with_contribution}/${r.linked_members} · ${r.suppressed_cells ? "sí" : "no"} · ${r.disclosed_pending}`),
    );
    console.log(`| ${s.id} | ${run.meta.k} | ${dist} | ${cols.join(" | ")} |`);
  }
}
console.log("");
for (const run of runs) console.log(`- k = ${run.meta.k}: SHA ${run.meta.sha}, árbol limpio ${run.meta.tree_clean}, ${run.meta.started_at} → ${run.meta.finished_at}, Node ${run.meta.node}`);
