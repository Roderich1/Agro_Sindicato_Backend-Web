// Pide por la ruta técnica existente (POST /estimation/jobs, F12) una ejecución nueva para la campaña del
// último borrador con referencia fijada y los mismos productos de su trabajo, y espera a que termine. Simula
// que alguien recalcula desde «Estimación del consumo»: la referencia del borrador NO debe cambiar sola.
// Se ejecuta desde Back/ con DEMO_PG_ADMIN_URL y DEMO_API. Contraseña de un solo uso, nunca impresa.
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { join, resolve } = require("node:path");
const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");

const API = process.env.DEMO_API || "http://127.0.0.1:3350/api/v1";
const DB_URL = (() => { const u = new URL(process.env.DEMO_PG_ADMIN_URL); u.pathname = "/agro_demo"; return u.toString(); })();
const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(`${API}${path}`, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, json: (() => { try { return JSON.parse(t); } catch { return null; } })() };
};

(async () => {
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const link = await db.jointPurchaseProposalEstimationLink.findFirst({ where: { jobId: { not: null } }, orderBy: { createdAt: "desc" }, select: { proposalId: true, jobId: true } });
  if (!link) throw new Error("no hay vínculos con trabajo");
  const job = await db.estimationJob.findUniqueOrThrow({ where: { id: link.jobId }, select: { targetCampaignId: true, productRefs: true } });
  await db.$disconnect();
  const pw = execFileSync(process.execPath, [join(__dirname, "../demo-rica/demo-rica.cjs"), "password-pipe", "directiva"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const login = await call("POST", "/auth/login", { body: { email: "directiva.demo@example.test", password: pw } });
  if (![200, 201].includes(login.status)) throw new Error(`login ${login.status}`);
  const token = login.json.accessToken;
  const created = await call("POST", "/estimation/jobs", { token, body: { contract_version: 1, request_id: randomUUID(), target_campaign_ref: job.targetCampaignId, product_refs: job.productRefs } });
  console.log(`POST /estimation/jobs → ${created.status} ${created.json?.status ?? created.json?.errorCode ?? ""}`);
  let view = created.json;
  for (let i = 0; i < 60 && view && !["COMPLETED", "NOT_EXECUTED"].includes(view.status); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    view = (await call("GET", `/estimation/jobs/${created.json.job_ref}`, { token })).json;
  }
  console.log(`trabajo ${view?.status} · ejecución ${view?.run_ref ? view.run_ref.slice(0, 8) : "—"}`);
  const after = await call("GET", `/collective/proposals/${link.proposalId}/estimation-link`, { token });
  const v = after.json;
  console.log(`referencia del borrador: state=${v.state} · run=${v.link?.run_ref?.slice(0, 8)} · update=${JSON.stringify(v.update)}`);
  console.log(`líneas: ${v.lines.map((l) => `${l.product?.name ?? l.product_ref}:${l.estimation.state}`).join(", ")}`);
})().catch((e) => { console.error(`ERROR ${e.message}`); process.exit(1); });
