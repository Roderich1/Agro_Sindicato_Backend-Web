// F12-EST-05 (#178): ensayo del trabajador de estimación como PROCESO REAL.
//
// Arranca el Backend compilado (`node dist/main.js`, la misma entrada que el
// Dockerfile) contra un PostgreSQL desechable con datos sintéticos, y recorre
// el servicio solo por HTTP: la API recibe la solicitud, el trabajador del
// propio proceso reclama el trabajo, el motor calcula y la ejecución se guarda,
// y la API entrega el resultado con su vigencia. Nunca llama al procesamiento
// directamente. Tres escenarios:
//   A. un proceso: solicitud → trabajador → ejecución → consulta por perfil;
//   B. dos procesos sobre la misma base: seis trabajos, cada uno una ejecución
//      y una cadena por campaña objetivo;
//   C. sin trabajador (ESTIMATION_WORKER=disabled) el trabajo espera en cola;
//      al arrancar un proceso con trabajador, lo toma y lo completa.
// Acredita integración y operación del Backend, no precisión (RNF-13) ni
// producción: NODE_ENV=development y COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic,
// que el Backend rechaza en producción.
//
// Uso, desde Back/ y con `npm run build` hecho:
//   node ../docs/evidence/f12_est_05/ensayo-proceso-trabajador.cjs <postgres-admin-url> <directorio-de-salida>
// Las contraseñas y los secretos JWT son efímeros: se generan aquí y no se
// escriben en ningún archivo ni en la salida.
const { createRequire } = require("node:module");
const { randomBytes, randomUUID } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { createWriteStream, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");

const back = process.cwd();
const req = createRequire(resolve(back, "package.json"));
req("ts-node/register/transpile-only");
req("tsconfig-paths/register");
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");
const { seedFixture } = req("./src/modules/sync-v1/test-support/sync-v1-test-app");
const { sealedConsumptionCampaigns } = req("./src/modules/estimation/test-support/synthetic-sources");

const [adminUrl, outDir] = process.argv.slice(2);
if (!adminUrl || !outDir) throw new Error("uso: ensayo-proceso-trabajador.cjs <postgres-admin-url> <directorio-de-salida>");
mkdirSync(outDir, { recursive: true });
const report = { started_at: new Date().toISOString(), node: process.version, git_head: git("rev-parse", "HEAD"), git_status: git("status", "--short"), scenarios: {} };
const processes = [];

function git(...args) {
  return spawnSync("git", args, { cwd: back, encoding: "utf8" }).stdout.trim();
}

async function createDatabase() {
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const name = `f12_worker_${randomUUID().replaceAll("-", "")}`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const deploy = spawnSync(process.execPath, [resolve(back, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: back, env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8",
  });
  if (deploy.status !== 0) throw new Error(`migrate deploy: ${deploy.stderr}`);
  report.migrations = (deploy.stdout.match(/(\d+) migrations? found/) ?? [])[1] ?? null;
  return { url: url.toString(), name };
}

const secrets = { jwt: randomBytes(24).toString("hex"), refresh: randomBytes(24).toString("hex") };

/** Starts `node dist/main.js` as a separate process and waits for its health route. */
async function startProcess(label, port, databaseUrl, extraEnv = {}) {
  const log = join(outDir, `proceso-${label}.log`);
  const stream = createWriteStream(log);
  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: back,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: secrets.jwt,
      JWT_REFRESH_SECRET: secrets.refresh,
      COLLECTIVE_DISCLOSURE_MODE: "provisional-synthetic",
      ESTIMATION_WORKER_INTERVAL_MS: "1000",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  const entry = { label, port, pid: child.pid, log, env: { NODE_ENV: "development", ESTIMATION_WORKER_INTERVAL_MS: "1000", ...extraEnv }, child };
  processes.push(entry);
  const deadline = Date.now() + 60000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`${label} terminó al arrancar (código ${child.exitCode})`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (res.ok) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) throw new Error(`${label} no respondió a /health en 60 s`);
    await sleep(500);
  }
  entry.ready_at = new Date().toISOString();
  return entry;
}

async function stopProcess(entry) {
  if (entry.child.exitCode !== null) return;
  const exited = new Promise((done) => entry.child.once("exit", done));
  entry.child.kill();
  await Promise.race([exited, sleep(10000)]);
  entry.stopped_at = new Date().toISOString();
}

async function call(port, method, path, token, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(port, email, password) {
  const res = await call(port, "POST", "/auth/login", null, { email, password });
  if (res.status !== 200 || !res.body.accessToken) throw new Error(`login ${res.status}`);
  return res.body.accessToken;
}

/** Waits, at most `ms`, for the job to leave QUEUED/RUNNING; polls slowly to stay under the 20/min limit. */
async function untilFinished(port, token, jobId, ms = 40000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const res = await call(port, "GET", `/estimation/jobs/${jobId}`, token);
    if (res.status !== 200) throw new Error(`GET job ${res.status}`);
    if (!["QUEUED", "RUNNING"].includes(res.body.status)) return res.body;
    if (Date.now() > deadline) throw new Error(`el trabajo ${jobId} no terminó en ${ms} ms`);
    await sleep(3000);
  }
}

/** Lines of the process log that show the worker and the series it built (no request bodies, no tokens). */
function workerLines(entry) {
  return readFileSync(entry.log, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""))
    .filter((line) => /\[(F12 WORKER|F12 SERIES)\]|Nest application successfully started/.test(line));
}

async function main() {
  const db = await createDatabase();
  report.database = db.name;
  const prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  const f = await seedFixture(prisma);
  const password = randomBytes(18).toString("base64url");
  const hash = await bcrypt.hash(password, 10);
  const people = {};
  for (const key of ["directorA", "farmerA"]) {
    const member = await prisma.member.findUniqueOrThrow({ where: { id: f.members[key] }, include: { user: true } });
    await prisma.user.update({ where: { id: member.userId }, data: { passwordHash: hash } });
    people[key] = { email: member.user.email, userId: member.userId };
  }
  const product = (await prisma.product.create({ data: { tenantId: f.tenantA, name: "Herbicida sintético del ensayo", unit: "L" } })).id;
  // The 3.12.5 example in mL, sealed with identified coverage (synthetic generator of the suites).
  const sources = await sealedConsumptionCampaigns(prisma, {
    tenantId: f.tenantA, sealedByUserId: people.directorA.userId, canonicalProductId: product, baseUnit: "ML", firstYear: 2015,
    quantities: [96000n, 120000n, 104000n, 116000n], namePrefix: "Campaña sintética del ensayo", coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3 },
  });
  const season = (
    await prisma.comparabilitySeason.create({
      data: { tenantId: f.tenantA, key: "ENSAYO", definition: "Temporada sintética del ensayo", durationDays: 180, createdByUserId: people.directorA.userId, createdByRole: "DIRECTIVA" },
    })
  ).id;
  const targets = [];
  for (const label of ["T1", "T2", "T3", "T4"]) {
    targets.push(
      (await prisma.agriculturalCampaign.create({ data: { tenantId: f.tenantA, name: `Objetivo sintético ${label}`, status: "PLANIFICADA", startDate: new Date("2019-09-01T00:00:00.000Z") } })).id,
    );
  }
  for (const campaignId of [...sources.map((s) => s.campaignId), ...targets]) {
    await prisma.campaignSeasonClassification.create({
      data: { tenantId: f.tenantA, campaignId, version: 1, seasonId: season, classifiedByUserId: people.directorA.userId, classifiedByRole: "DIRECTIVA" },
    });
  }
  const tables = async () =>
    Object.fromEntries(
      await Promise.all(
        ["EstimationJob", "EstimationRun", "EstimationResult", "ConsumptionSeries", "InventoryLot", "StockMovement", "Purchase", "PurchaseItem", "JointPurchaseProposal", "JointPurchaseProposalLine", "CollectiveRelease", "SyncV1Contribution"].map(async (t) => {
          try {
            const [row] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
            return [t, row.n];
          } catch {
            return [t, null];
          }
        }),
      ),
    );
  report.rows_before = await tables();

  // A. One process: request → its worker → stored run → reading.
  const a = await startProcess("A", 3291, db.url);
  const director = await login(a.port, people.directorA.email, password);
  const farmer = await login(a.port, people.farmerA.email, password);
  const asked = await call(a.port, "POST", "/estimation/jobs", director, { contract_version: 1, request_id: randomUUID(), target_campaign_ref: targets[0] });
  if (asked.status !== 202) throw new Error(`POST /jobs ${asked.status}`);
  const finished = await untilFinished(a.port, director, asked.body.job_ref);
  const run = await call(a.port, "GET", `/estimation/runs/${finished.run_ref}`, director);
  const institutional = await call(a.port, "GET", `/estimation/results?target_campaign_ref=${targets[0]}`, director);
  const asFarmer = await call(a.port, "GET", `/estimation/results?target_campaign_ref=${targets[0]}`, farmer);
  const list = await call(a.port, "GET", `/estimation/runs?target_campaign_ref=${targets[0]}`, director);
  const result = run.body.results[0];
  report.scenarios.A = {
    process: { pid: a.pid, port: a.port, env: a.env },
    post: { status: asked.status, job: { status: asked.body.status, attempts: asked.body.attempts, max_attempts: asked.body.max_attempts } },
    job: { status: finished.status, attempts: finished.attempts, enqueued_at: finished.enqueued_at, started_at: finished.started_at, finished_at: finished.finished_at, run_ref: finished.run_ref },
    run: { status: run.status, outcome: run.body.outcome, method_version: run.body.method_version, content_hash: run.body.content_hash, generated_at: run.body.generated_at },
    result: { status: result.status, alpha: result.alpha, estimate_base: result.estimate_base, naive_base: result.naive_base, span_length: result.span_length, validity: result.validity },
    results_institutional: { status: institutional.status, profile: institutional.body.profile, keys: Object.keys(institutional.body.results[0]).sort() },
    results_farmer: { status: asFarmer.status, profile: asFarmer.body.profile, keys: Object.keys(asFarmer.body.results[0]).sort(), estimate_base: asFarmer.body.results[0].estimate_base },
    runs_list: { status: list.status, items: list.body.items.length, next_cursor: list.body.next_cursor },
  };

  // B. A second process on the same base: six jobs (two targets, so two chains), each with one run.
  const b = await startProcess("B", 3292, db.url);
  const directorB = await login(b.port, people.directorA.email, password);
  const jobs = [];
  for (const target of [targets[1], targets[2], targets[1], targets[2], targets[1], targets[2]]) {
    const res = await call(b.port, "POST", "/estimation/jobs", directorB, { contract_version: 1, request_id: randomUUID(), target_campaign_ref: target });
    if (res.status !== 202) throw new Error(`POST /jobs (B) ${res.status}`);
    jobs.push(res.body.job_ref);
  }
  const done = [];
  for (const jobId of jobs) done.push(await untilFinished(b.port, directorB, jobId));
  const runsPerJob = await prisma.estimationRun.groupBy({ by: ["jobId"], where: { jobId: { in: jobs } }, _count: { _all: true } });
  const chains = {};
  for (const target of [targets[1], targets[2]]) {
    const chain = await prisma.estimationRun.findMany({ where: { targetCampaignId: target }, orderBy: [{ generatedAt: "asc" }, { id: "asc" }], select: { id: true, previousRunId: true } });
    chains[target] = { runs: chain.length, linear: chain.every((run, i) => run.previousRunId === (i === 0 ? null : chain[i - 1].id)) };
  }
  report.scenarios.B = {
    chains,
    processes: [{ pid: a.pid, port: a.port }, { pid: b.pid, port: b.port }],
    jobs: done.map((job) => ({ job_ref: job.job_ref, status: job.status, attempts: job.attempts, run_ref: job.run_ref })),
    runs_per_job: runsPerJob.map((r) => r._count._all),
    taken_by: Object.fromEntries(
      jobs.map((jobId) => [jobId, [a, b].filter((p) => workerLines(p).some((line) => line.includes(`job=${jobId}`) && line.includes("run="))).map((p) => p.label)]),
    ),
  };
  await stopProcess(a);
  await stopProcess(b);

  // C. No worker: the job waits; a process with a worker takes it when it starts.
  const c = await startProcess("C", 3293, db.url, { ESTIMATION_WORKER: "disabled" });
  const directorC = await login(c.port, people.directorA.email, password);
  const waiting = await call(c.port, "POST", "/estimation/jobs", directorC, { contract_version: 1, request_id: randomUUID(), target_campaign_ref: targets[3] });
  await sleep(4000);
  const stillQueued = await call(c.port, "GET", `/estimation/jobs/${waiting.body.job_ref}`, directorC);
  await stopProcess(c);
  const d = await startProcess("D", 3294, db.url);
  const directorD = await login(d.port, people.directorA.email, password);
  const picked = await untilFinished(d.port, directorD, waiting.body.job_ref);
  report.scenarios.C = {
    without_worker: { pid: c.pid, status_after_4s: stillQueued.body.status, attempts: stillQueued.body.attempts },
    with_worker: { pid: d.pid, status: picked.status, attempts: picked.attempts, run_ref: picked.run_ref },
  };
  await stopProcess(d);

  report.rows_after = await tables();
  report.worker_log = Object.fromEntries(processes.map((p) => [p.label, workerLines(p)]));
  report.processes = processes.map((p) => ({ label: p.label, pid: p.pid, port: p.port, env: p.env, ready_at: p.ready_at, stopped_at: p.stopped_at ?? null }));
  report.finished_at = new Date().toISOString();
  await prisma.$disconnect();
}

main()
  .catch((error) => {
    report.error = String(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const p of processes) await stopProcess(p);
    writeFileSync(join(outDir, "ensayo-proceso-trabajador.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${report.error ? "FALLO" : "OK"} ${join(outDir, "ensayo-proceso-trabajador.json")}\n`);
  });
