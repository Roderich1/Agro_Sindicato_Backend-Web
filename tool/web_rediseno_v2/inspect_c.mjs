/**
 * Sesión C (rediseño Web v2, 2026-11-13): recuento de solo lectura de los datos sintéticos de la base aislada
 * (`agro_demo` en 15434) que necesitan las capturas de catálogo, campañas, usuarios y bitácora. No escribe nada
 * y no imprime correos, claves ni URL. Variables de `_wt/ET2-BE/tool/etapa3/e3env.sh` (BE_DIR, DEMO_PG_ADMIN_URL).
 *   node inspect_c.mjs
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { BE_DIR, DEMO_PG_ADMIN_URL } = process.env;
const backRequire = createRequire(join(BE_DIR, 'Back', 'package.json'));
const { PrismaClient } = backRequire('@prisma/client');
const url = new URL(DEMO_PG_ADMIN_URL);
url.pathname = '/agro_demo';
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
try {
  const tenant = await db.tenant.findFirst({ where: { users: { some: { email: 'directiva.demo@example.test' } } }, select: { id: true, name: true } });
  const where = { tenantId: tenant.id };
  const out = {
    tenant: tenant.name,
    identification: await db.productIdentificationRequest.groupBy({ by: ['status', 'photoState'], where, _count: true }),
    pendingWithNote: await db.productIdentificationRequest.count({ where: { ...where, status: 'PENDING', pendingNote: { not: null } } }),
    campaigns: await db.agriculturalCampaign.groupBy({ by: ['status', 'isActive'], where, _count: true }),
    seals: await db.collectiveSeal.count({ where }),
    products: await db.product.groupBy({ by: ['isActive', 'unit'], where, _count: true }),
    associationsCurrent: await db.productCanonicalAssociation.count({ where: { ...where, validTo: null } }),
    associationsAll: await db.productCanonicalAssociation.count({ where }),
    users: await db.user.groupBy({ by: ['role', 'isActive'], where, _count: true }),
    auditLogs: await db.auditLog.groupBy({ by: ['entityName'], where: { ...where, ownerUserId: null }, _count: true }),
  };
  console.log(JSON.stringify(out, null, 1));
} finally {
  await db.$disconnect();
}
