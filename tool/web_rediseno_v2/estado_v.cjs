// Sesión VERIFICACIÓN del rediseño Web v2 (2026-11-13): instantánea de SÓLO LECTURA de la base
// sintética aislada (agro_demo del contenedor agro_et1_pg, 15434), para comparar antes y después de
// cada recorrido. No escribe nada, no inicia sesión y no imprime credenciales ni correos.
//   node tool/web_rediseno_v2/estado_v.cjs [salida.json]
// Entorno: BE_DIR y DEMO_PG_ADMIN_URL (tool/etapa3/e3env.sh de ET2-BE), cargados con `source`.
const { createRequire } = require("node:module");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const req = createRequire(resolve(process.env.BE_DIR, "Back", "package.json"));
const { PrismaClient } = req("@prisma/client");
const DB_URL = (() => { const u = new URL(process.env.DEMO_PG_ADMIN_URL); u.pathname = "/agro_demo"; return u.toString(); })();
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const short = (id) => (id ? String(id).slice(0, 8) : null);

(async () => {
  const [out] = process.argv.slice(2);
  const users = await db.user.findMany({ select: { id: true, name: true, role: true, isActive: true }, orderBy: { name: "asc" } });
  const uname = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const calls = await db.jointPurchaseCall.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true, deadlineAt: true, responsibleUserId: true, responsibleVersion: true, closedAt: true, cancelledAt: true, _count: { select: { participations: true, products: true, events: true } } },
  });
  const grants = await db.jointPurchaseSubstitutionGrant.findMany({ select: { userId: true, grantedAt: true } });
  const grantEvents = await db.jointPurchaseSubstitutionGrantEvent.findMany({ orderBy: { at: "asc" }, select: { userId: true, action: true, actorUserId: true, at: true } });
  const idf = await db.productIdentificationRequest.findMany({ orderBy: { receivedAt: "asc" }, select: { id: true, localName: true, status: true, photoState: true, productId: true, resolvedAt: true } });
  const counts = {
    purchases: await db.purchase.count(),
    purchaseItems: await db.purchaseItem.count(),
    payableAccounts: await db.payableAccount.count(),
    payments: await db.payment.count(),
    inventoryLots: await db.inventoryLot.count(),
    stockMovements: await db.stockMovement.count(),
    jointPurchaseCalls: calls.length,
    callClosings: await db.jointPurchaseCallClosing.count(),
    auditLogs: await db.auditLog.count(),
    products: await db.product.count(),
    activeProducts: await db.product.count({ where: { isActive: true } }),
  };
  const snap = {
    at: new Date().toISOString(),
    counts,
    calls: calls.map((c) => ({ id: short(c.id), name: c.name, status: c.status, deadline: c.deadlineAt, responsible: uname[c.responsibleUserId], version: c.responsibleVersion, participations: c._count.participations, products: c._count.products, events: c._count.events })),
    substitutionHolders: grants.map((g) => ({ user: uname[g.userId], at: g.grantedAt })),
    substitutionEvents: grantEvents.map((e) => ({ user: uname[e.userId], action: e.action, actor: uname[e.actorUserId], at: e.at })),
    identification: idf.map((r) => ({ id: short(r.id), localName: r.localName, status: r.status, photo: r.photoState, product: short(r.productId), resolvedAt: r.resolvedAt })),
    users: users.map((u) => ({ name: u.name, role: u.role, active: u.isActive })),
  };
  const text = JSON.stringify(snap, null, 1);
  if (out) writeFileSync(out, text); else console.log(text);
  await db.$disconnect();
})().catch(async (e) => { console.error(String(e.message).slice(0, 300)); await db.$disconnect(); process.exit(1); });
