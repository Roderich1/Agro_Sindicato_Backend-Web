// P-A (E2 §12) por la API REAL del entorno AISLADO (3350, base agro_demo del contenedor
// agro_et1_pg). Datos SINTÉTICOS. Nunca imprime credenciales ni tokens: las contraseñas son de
// un solo uso, viven en memoria y se fijan en la base aislada (no en la DEMO oficial).
// Desde Back/:
//   node ../tool/etapa3/pa_walk.cjs setup                 personas PA, convocatoria abierta, delegaciones y participaciones
//   node ../tool/etapa3/pa_walk.cjs deactivate <clave>    inhabilita a una persona por la API de usuarios (PATCH /users/:id/deactivate)
//   node ../tool/etapa3/pa_walk.cjs reactivate <clave>
//   node ../tool/etapa3/pa_walk.cjs state                 estado de la convocatoria PA (sin nombres de agricultores)
//   node ../tool/etapa3/pa_walk.cjs view <clave>          lo que ve esa persona institucional (detalle, participantes)
//   node ../tool/etapa3/pa_walk.cjs farmer <agricultorN> <2|3> <shape|authorize|widen|reduce|modify> [args]
//   node ../tool/etapa3/pa_walk.cjs race                  dos sustituciones simultáneas sobre otra convocatoria + reintento
// Entorno: DEMO_PG_ADMIN_URL, DEMO_API (tool/etapa3/e3env.sh).
const { createRequire } = require("node:module");
const { randomBytes, randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const [cmd, ...args] = process.argv.slice(2);
const API = process.env.DEMO_API || "http://127.0.0.1:3350/api/v1";
const DB_URL = (() => {
  const u = new URL(process.env.DEMO_PG_ADMIN_URL);
  u.pathname = "/agro_demo";
  return u.toString();
})();
const CALL_NAME = "Convocatoria P-A sustitución (sintética)";
const RACE_NAME = "Convocatoria P-A concurrencia (sintética)";
const PEOPLE = {
  admin: { email: "admin.demo@example.test" },
  directiva: { email: "directiva.demo@example.test" },
  resp: { email: "responsable.pa@example.test", name: "Responsable PA (sintética)", role: "DIRECTIVA" },
  suc: { email: "sucesora.pa@example.test", name: "Sucesora PA (sintética)", role: "DIRECTIVA" },
  admin2: { email: "admin2.pa@example.test", name: "Administración PA 2 (sintética)", role: "ADMINISTRADOR" },
  resp2: { email: "responsable2.pa@example.test", name: "Responsable PA 2 (sintética)", role: "DIRECTIVA" },
};

const call = async (method, path, { token, body, contract } = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(contract ? { "X-Joint-Purchase-Contract": String(contract) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return { status: r.status, json: (() => { try { return JSON.parse(t); } catch { return null; } })() };
};
const must = (r, ok, what) => {
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.json?.errorCode ?? r.json?.message ?? ""}`);
  return r.json;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const tokens = {};
async function login(key) {
  if (tokens[key]) return tokens[key];
  const person = PEOPLE[key];
  const password = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email: person.email }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  let r = await call("POST", "/auth/login", { body: { email: person.email, password } });
  if (r.status === 429) { await sleep(61000); r = await call("POST", "/auth/login", { body: { email: person.email, password } }); }
  tokens[key] = must(r, [200, 201], `login ${key}`).accessToken;
  return tokens[key];
}
async function userId(key) {
  return (await db.user.findUniqueOrThrow({ where: { email: PEOPLE[key].email }, select: { id: true } })).id;
}

async function farmerToken(farmerKey) {
  const email = `${farmerKey}.demo@example.test`;
  const farmer = await db.user.findUniqueOrThrow({ where: { email } });
  const pw = randomBytes(18).toString("base64url");
  must(await call("PATCH", `/users/${farmer.id}/password`, { token: await login("admin"), body: { password: pw } }), [200, 204], "contraseña");
  const l = must(await call("POST", "/auth/v2/login", { body: { email, password: pw, refreshTransport: "BODY" } }), [200], "login v2");
  const reg = must(await call("POST", "/auth/clients", { token: l.accessToken, body: { clientId: randomUUID() } }), [200, 201], "cliente");
  must(await call("POST", "/auth/v2/session/client", { token: l.accessToken, body: { registrationId: reg.registrationId } }), [200, 201], "vínculo");
  return { token: l.accessToken, refresh: l.refreshToken };
}

async function ensurePeople() {
  const admin = await login("admin");
  for (const key of ["resp", "suc", "admin2", "resp2"]) {
    const person = PEOPLE[key];
    if (await db.user.findUnique({ where: { email: person.email } })) continue;
    must(
      await call("POST", "/users", { token: admin, body: { name: person.name, email: person.email, password: randomBytes(18).toString("base64url"), role: person.role, ...(person.role === "ADMINISTRADOR" ? { allowAdministrator: true } : {}) } }),
      [200, 201],
      `crear ${key}`,
    );
  }
}

async function freeProducts(n, campaignId, tenantId) {
  const busy = await db.jointPurchaseCallProduct.findMany({ where: { tenantId, openCampaignId: campaignId }, select: { productId: true } });
  const aliased = await db.productCanonicalAssociation.findMany({ where: { tenantId, validTo: null }, select: { productId: true, canonicalProductId: true } });
  const skip = new Set([...busy.map((b) => b.productId), ...aliased.filter((a) => a.productId !== a.canonicalProductId).map((a) => a.productId)]);
  const products = await db.product.findMany({ where: { tenantId, isActive: true, unit: { in: ["L", "KG", "l", "kg", "Litros", "Kilogramos"] } }, orderBy: { name: "asc" } });
  return products.filter((p) => !skip.has(p.id)).slice(0, n);
}

async function createOpenCall(name, responsibleKey, deadlineHours = 48) {
  const existing = await db.jointPurchaseCall.findFirst({ where: { name }, orderBy: { createdAt: "desc" } });
  if (existing) return existing.id;
  const admin = await db.user.findUniqueOrThrow({ where: { email: PEOPLE.admin.email } });
  const campaign = await db.agriculturalCampaign.findFirstOrThrow({ where: { tenantId: admin.tenantId, status: "ABIERTA" } });
  const products = await freeProducts(2, campaign.id, admin.tenantId);
  if (products.length < 2) throw new Error("no hay productos libres en la campaña abierta");
  const created = must(
    await call("POST", "/joint-purchase-calls", {
      token: await login("directiva"),
      body: {
        campaign_id: campaign.id,
        name,
        deadline_at: new Date(Date.now() + deadlineHours * 3600e3).toISOString(),
        responsible_user_id: await userId(responsibleKey),
        products: products.map((p) => ({ product_ref: p.id })),
      },
    }),
    [201],
    "crear convocatoria",
  );
  must(await call("POST", `/joint-purchase-calls/${created.call_id}/open`, { token: await login(responsibleKey), body: { confirmed: true } }), [200], "abrir");
  return created.call_id;
}

async function callId(name = CALL_NAME) {
  return (await db.jointPurchaseCall.findFirstOrThrow({ where: { name }, orderBy: { createdAt: "desc" } })).id;
}

const shapeOf = (p) =>
  p ? { status: p.status, scope: p.consent_scope?.scope, authorization: p.responsible_authorization ?? "(sin dato en este contrato)", lines: p.lines.length } : null;

(async () => {
  try {
    if (cmd === "setup") {
      await ensurePeople();
      const id = await createOpenCall(CALL_NAME, "resp");
      const resp = await login("resp");
      for (const [to, grant] of [["admin", "PARTICIPANTS"], ["directiva", "MANAGE"]]) {
        must(await call("POST", `/joint-purchase-calls/${id}/collaborators`, { token: resp, body: { user_ref: await userId(to), grant, confirmed: true } }), [200], `conceder ${grant}`);
      }
      const detail = must(await call("GET", `/joint-purchase-calls/${id}`, { token: resp }), [200], "detalle");
      // Dos agricultores participan por la API (contrato 3 y contrato 2); el del teléfono lo hace en el emulador.
      for (const [farmerKey, contract] of [["agricultor1", 3], ["agricultor2", 2]]) {
        const { token } = await farmerToken(farmerKey);
        const has = (await call("GET", "/me/joint-purchase-calls", { token, contract })).json.calls.find((c) => c.call_id === id)?.participation;
        if (has) continue;
        must(
          await call("PUT", `/me/joint-purchase-calls/${id}/participation`, {
            token,
            contract,
            body: {
              operation_id: randomUUID(),
              sequence: 1,
              consent: { version: "CONV-3", accepted_at: new Date().toISOString() },
              ...(contract === 3 ? { responsible_version: 1 } : {}),
              lines: [{ product_ref: detail.products[0].product_ref, quantity_base: String(contract === 3 ? 12000 : 8000) }],
            },
          }),
          [200],
          `participar ${farmerKey}`,
        );
        if (contract === 3) {
          must(
            await call("POST", `/me/joint-purchase-calls/${id}/participation/consent`, {
              token,
              contract,
              body: { operation_id: randomUUID(), sequence: 1, scope: "COLLABORATORS", consent: { version: "CONV-3", decided_at: new Date().toISOString() }, responsible_version: 1 },
            }),
            [200],
            "ampliar",
          );
        }
      }
      console.log(JSON.stringify({ call: id.slice(0, 8), products: detail.products.map((p) => p.name), responsible_version: detail.responsible.version }));
    } else if (cmd === "deactivate" || cmd === "reactivate") {
      const key = args[0];
      const id = await userId(key);
      const r = cmd === "deactivate"
        ? await call("PATCH", `/users/${id}/deactivate`, { token: await login("admin") })
        : { status: (await db.user.update({ where: { id }, data: { isActive: true, members: { updateMany: { where: {}, data: { isActive: true } } } } }), 200) };
      console.log(JSON.stringify({ [cmd]: key, status: r.status, eligible_now: !!(await db.member.findFirst({ where: { userId: id, isActive: true, user: { isActive: true } } })) }));
    } else if (cmd === "state") {
      const id = await callId(args[0] === "race" ? RACE_NAME : CALL_NAME);
      const c = await db.jointPurchaseCall.findUniqueOrThrow({ where: { id }, include: { responsible: { select: { name: true } } } });
      const parts = await db.jointPurchaseParticipation.findMany({ where: { callId: id }, select: { consentScope: true, consentResponsibleVersion: true, status: true } });
      const access = await db.jointPurchaseCallAccess.findMany({ where: { callId: id }, include: { user: { select: { name: true } } } });
      const changes = await db.jointPurchaseResponsibleChange.findMany({ where: { callId: id }, orderBy: { version: "asc" } });
      const events = await db.jointPurchaseCallAccessEvent.findMany({ where: { callId: id }, orderBy: { at: "asc" }, select: { action: true, grant: true } });
      console.log(JSON.stringify({
        status: c.status,
        responsible: c.responsible.name,
        responsible_version: c.responsibleVersion,
        participations: parts.map((p) => ({ status: p.status, scope: p.consentScope, authorized_version: p.consentResponsibleVersion })),
        access: access.map((a) => ({ user: a.user.name, grant: a.grant, by_system: a.grantedByUserId === null, version: a.responsibleVersion })),
        access_events: events.map((e) => `${e.action}:${e.grant}`),
        changes: changes.map((ch) => ({ version: ch.version, status_then: ch.callStatus, suspended: ch.suspendedDelegations, reason: ch.reason })),
      }, null, 1));
    } else if (cmd === "view") {
      const key = args[0];
      const id = await callId();
      const token = await login(key);
      const d = must(await call("GET", `/joint-purchase-calls/${id}`, { token }), [200], "detalle");
      const p = await call("GET", `/joint-purchase-calls/${id}/participants`, { token });
      console.log(JSON.stringify({
        viewer: key,
        is_responsible: d.is_responsible,
        can_manage: d.can_manage,
        can_substitute_responsible: d.can_substitute_responsible,
        pending_authorization_count: d.pending_authorization_count,
        pending_delegation_reviews: d.pending_delegation_reviews,
        totals: d.products.map((x) => x.totals.visibility),
        participants: p.status === 200 ? { count: p.json.participants.length, pending: p.json.pending_authorization_count, hidden: p.json.hidden_participant_count } : p.json,
      }));
    } else if (cmd === "farmer") {
      const [farmerKey, contractRaw, action, extra] = args;
      const contract = Number(contractRaw);
      const id = await callId();
      const { token } = await farmerToken(farmerKey);
      const list = must(await call("GET", "/me/joint-purchase-calls", { token, contract }), [200], "lista");
      const mine = list.calls.find((c) => c.call_id === id);
      if (action === "shape") {
        console.log(JSON.stringify({ contract, contractVersion: list.contractVersion, responsible: mine?.responsible, participation: shapeOf(mine?.participation), participation_keys: mine?.participation ? Object.keys(mine.participation).sort() : null }));
      } else if (action === "modify") {
        const r = await call("PUT", `/me/joint-purchase-calls/${id}/participation`, {
          token,
          contract,
          body: { operation_id: randomUUID(), sequence: mine.participation.last_sequence + 1, lines: [{ product_ref: mine.products[0].product_ref, quantity_base: extra ?? "15000" }] },
        });
        console.log(JSON.stringify({ modify: contract, status: r.status, outcome: r.json?.outcome ?? r.json?.errorCode, participation: shapeOf(r.json?.participation) }));
      } else {
        const scope = action === "reduce" ? "RESPONSIBLE_ONLY" : action === "widen" ? "COLLABORATORS" : (extra ?? "RESPONSIBLE_ONLY");
        const body = {
          operation_id: randomUUID(),
          sequence: (mine.participation.consent_scope?.sequence ?? 0) + 1,
          scope,
          consent: { version: "CONV-3", decided_at: new Date().toISOString() },
          ...(contract === 3 && action !== "reduce" ? { responsible_version: Number(process.env.SHOWN_VERSION || mine.responsible.version) } : {}),
          ...(action === "authorize" ? { authorize_responsible: true } : {}),
        };
        const r = await call("POST", `/me/joint-purchase-calls/${id}/participation/consent`, { token, contract, body });
        const again = await call("POST", `/me/joint-purchase-calls/${id}/participation/consent`, { token, contract, body });
        console.log(JSON.stringify({ action, contract, shown_version: body.responsible_version ?? null, status: r.status, outcome: r.json?.outcome ?? r.json?.errorCode, responsible_version: r.json?.responsible_version, participation: shapeOf(r.json?.participation), retry_same_status: again.status }));
      }
    } else if (cmd === "race") {
      await ensurePeople();
      // Dos personas con el permiso: Directiva DEMO (concedido en la Web) y Administración PA 2 (lo concede Administración DEMO).
      must(
        await call("POST", "/joint-purchase-substitution-permissions", {
          token: await login("admin"),
          body: { user_ref: await userId("admin2"), reason: "Segunda persona para la prueba de concurrencia (sintética)", confirmed: true },
        }),
        [200],
        "conceder permiso a admin2",
      );
      // La responsable de la prueba vuelve a estar habilitada (cuenta y Member) para crear la convocatoria nueva.
      await db.user.update({ where: { email: PEOPLE.resp2.email }, data: { isActive: true, members: { updateMany: { where: {}, data: { isActive: true } } } } });
      const id = await createOpenCall(`${RACE_NAME} ${new Date().toISOString().slice(11, 19)}`, "resp2");
      const respMember = await db.member.findFirstOrThrow({ where: { user: { email: PEOPLE.resp2.email } } });
      await call("PATCH", `/users/${respMember.userId}/deactivate`, { token: await login("admin") });
      const holders = ["directiva", "admin2"];
      const tokensBy = Object.fromEntries(await Promise.all(holders.map(async (k) => [k, await login(k)])));
      const requestIds = { directiva: randomUUID(), admin2: randomUUID() };
      const body = (k, to) => ({ request_id: requestIds[k], expected_responsible_version: 1, new_responsible_ref: to, reason: `Prueba de concurrencia (${k})`, confirmed: true });
      const [suc, adm] = [await userId("suc"), await userId("admin")];
      const results = await Promise.all([
        call("POST", `/joint-purchase-calls/${id}/responsible`, { token: tokensBy.directiva, body: body("directiva", suc) }),
        call("POST", `/joint-purchase-calls/${id}/responsible`, { token: tokensBy.admin2, body: body("admin2", adm) }),
      ]);
      const winner = results[0].status === 200 ? "directiva" : "admin2";
      const retry = await call("POST", `/joint-purchase-calls/${id}/responsible`, { token: tokensBy[winner], body: body(winner, winner === "directiva" ? suc : adm) });
      const reused = await call("POST", `/joint-purchase-calls/${id}/responsible`, { token: tokensBy[winner], body: { ...body(winner, winner === "directiva" ? suc : adm), reason: "Otro motivo" } });
      console.log(JSON.stringify({
        concurrent: results.map((r, i) => ({ by: holders[i], status: r.status, code: r.json?.errorCode ?? null, responsible_version: r.json?.responsible_version ?? r.json?.responsible?.version })),
        retry_same_request: { status: retry.status, version: retry.json?.responsible?.version },
        same_request_other_body: { status: reused.status, code: reused.json?.errorCode },
        changes_in_db: await db.jointPurchaseResponsibleChange.count({ where: { callId: id } }),
        replaced_events: await db.jointPurchaseCallEvent.count({ where: { callId: id, kind: "RESPONSIBLE_REPLACED" } }),
      }));
    } else {
      console.error("orden desconocida");
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(`ERROR ${String(e.message).slice(0, 200)}`);
  process.exit(1);
});
