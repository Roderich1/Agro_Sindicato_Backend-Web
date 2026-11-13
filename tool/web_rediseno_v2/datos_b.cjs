// Sesión B del rediseño Web v2 (2026-11-13): datos para las capturas, por la API REAL del entorno
// AISLADO (3350, base agro_demo del contenedor agro_et1_pg). Datos SINTÉTICOS. Nunca imprime
// credenciales ni tokens: las contraseñas son de un solo uso, viven en memoria y se fijan en la
// base aislada (no en la DEMO oficial). Se ejecuta desde `Back/` de un worktree con Prisma generado
// (BE_DIR de tool/etapa3/e3env.sh):
//   node <ruta>/datos_b.cjs inspect            qué ve cada cuenta en cada convocatoria (estado, permisos, visibilidad)
//   node <ruta>/datos_b.cjs revoked            lámina 17: la responsable de «Convocatoria P-C y N7» concede
//                                              «Consultar participantes» a Administración PA 2 y se lo retira
const { createRequire } = require("node:module");
const { randomBytes } = require("node:crypto");
const { resolve } = require("node:path");
const req = createRequire(resolve(process.env.BE_DIR, "Back", "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const API = process.env.DEMO_API || "http://127.0.0.1:3350/api/v1";
const DB_URL = (() => {
  const u = new URL(process.env.DEMO_PG_ADMIN_URL);
  u.pathname = "/agro_demo";
  return u.toString();
})();
const EMAIL = {
  admin: "admin.demo@example.test",
  directiva: "directiva.demo@example.test",
  suc: "sucesora.pa@example.test",
  admin2: "admin2.pa@example.test",
};
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return { status: r.status, json: (() => { try { return JSON.parse(t); } catch { return null; } })() };
}
function must(r, ok, what) {
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.json?.errorCode ?? r.json?.message ?? ""}`);
  return r.json;
}
const tokens = {};
async function login(key) {
  if (tokens[key]) return tokens[key];
  const password = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email: EMAIL[key] }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  let r = await call("POST", "/auth/login", { body: { email: EMAIL[key], password } });
  if (r.status === 429) { await sleep(61000); r = await call("POST", "/auth/login", { body: { email: EMAIL[key], password } }); }
  tokens[key] = must(r, [200, 201], `login ${key}`).accessToken;
  await sleep(3500); // límite de autenticación del entorno (20/min), compartido con otras sesiones
  return tokens[key];
}
async function callId(name) {
  const c = await db.jointPurchaseCall.findFirst({ where: { name }, select: { id: true } });
  if (!c) throw new Error(`no existe «${name}»`);
  return c.id;
}

(async () => {
  const [cmd] = process.argv.slice(2);
  if (cmd === "inspect") {
    const calls = await db.jointPurchaseCall.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    for (const key of ["directiva", "admin", "suc", "admin2"]) {
      const token = await login(key);
      for (const c of calls) {
        const d = must(await call("GET", `/joint-purchase-calls/${c.id}`, { token }), [200], "detalle");
        const col = must(await call("GET", `/joint-purchase-calls/${c.id}/collaborators`, { token }), [200], "colaboradores");
        console.log(
          [key, c.id.slice(0, 8), d.status, c.name.slice(0, 40), `resp=${d.responsible.name}${d.responsible.eligible ? "" : "(no habilitada)"}`,
            `isResp=${d.is_responsible}`, `manage=${d.can_manage}`, `viewP=${d.can_view_participants}`, `subst=${d.can_substitute_responsible}`,
            `grants=${(d.my_grants || []).join("+")}`, `tot=${d.products.map((p) => p.totals.visibility).join(",")}`,
            `colab=${col.collaborators.map((x) => `${x.name}:${x.grants.map((g) => `${g.grant}/${g.status}`).join("+")}`).join(";")}`].join(" | "),
        );
      }
    }
  } else if (cmd === "revoked") {
    const id = await callId("Convocatoria P-C y N7 (sintética)");
    const admin2 = await db.user.findUnique({ where: { email: EMAIL.admin2 }, select: { id: true } });
    const token = await login("directiva");
    must(await call("POST", `/joint-purchase-calls/${id}/collaborators`, { token, body: { user_ref: admin2.id, grant: "PARTICIPANTS", confirmed: true } }), [200, 201], "conceder");
    const v = must(await call("POST", `/joint-purchase-calls/${id}/collaborators/revoke`, { token, body: { user_ref: admin2.id, grant: "PARTICIPANTS" } }), [200, 201], "retirar");
    console.log(`historial de permisos: ${v.history.map((e) => `${e.action} ${e.grant} ${e.user.name} por ${e.actor.name}`).join(" · ")}`);
  } else throw new Error("uso: inspect | revoked");
  await db.$disconnect();
})().catch(async (e) => {
  console.error(String(e.message).slice(0, 300));
  await db.$disconnect();
  process.exit(1);
});
