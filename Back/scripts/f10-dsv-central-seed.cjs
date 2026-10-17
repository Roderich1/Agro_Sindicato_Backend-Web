/**
 * F10 (RNF-06, R5a/R5b): generador reproducible del dataset SINTÉTICO DS-V
 * Central sobre una base local desechable y ya migrada.
 *
 * Prepara la base directamente (decisión de cierre del 2026-10-16: «es válido
 * preparar fixtures de base directamente antes de medir consultas, manteniendo
 * invariantes; eso no cuenta como una prueba de publicación por Sync»). Cada
 * aportación ACTIVE lleva su intención PUBLISH aplicada en el journal, como la
 * dejaría Sync v1, de modo que se cumplen las restricciones CHECK de la base.
 *
 * Determinista: con la misma semilla produce los mismos ids, aportaciones y
 * cantidades, y la misma huella del dataset (`dataset_sha256`). Lo único que
 * cambia entre ejecuciones son los hashes bcrypt y las huellas del journal,
 * que no forman parte del dataset medido.
 *
 * Sólo para desarrollo: se niega con NODE_ENV=production, con una base que no
 * sea local, sin F10_DSV_SEED=yes o si el tenant ya existe. No imprime
 * contraseñas ni tokens.
 *
 * Entorno: DATABASE_URL (local), F10_DSV_SEED=yes, EVAL_PASSWORD (contraseña
 * de las dos cuentas institucionales, sólo en el proceso) y, opcional,
 * F10_DSV_SEED_VALUE (semilla; por defecto la publicada en la evidencia).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const { createHash, randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");

const env = process.env;
if (env.NODE_ENV === "production") throw new Error("Refused: NODE_ENV=production");
if (env.F10_DSV_SEED !== "yes") throw new Error("Refused: set F10_DSV_SEED=yes");
if (!["127.0.0.1", "localhost"].includes(new URL(env.DATABASE_URL).hostname)) {
  throw new Error("Refused: database is not local");
}
if (!env.EVAL_PASSWORD) throw new Error("Missing EVAL_PASSWORD");

const SEED = env.F10_DSV_SEED_VALUE || "20261016"; // protocolo F10 v1.1 §1.4

/** Especificación DS-V Central (protocolo F10 v1.1 §1.4, commit 7581af2). */
const SPEC = {
  farmers: 74, // Members AGRICULTOR sintéticos (tamaño de la nómina, tesis §1.8.1)
  products: 20, // P01–P12 líquidos (L → ML), P13–P20 sólidos (kg → G)
  liquids: 12,
  campaigns: 2,
  // Por campaña: Members que declaran necesidad y que publican consumo.
  needMembers: 60,
  consumptionMembers: 45,
  productsPerMember: [1, 6], // productos distintos por Member y tipo
  // Productos sin datos en ninguna de las dos proyecciones (≥ 2).
  emptyProducts: ["P19", "P20"],
  // Productos con 1–2 contribuyentes (≥ 3), para la supresión con k = 3:
  // aportantes por tipo; 0 = la celda no existe.
  rareProducts: { P16: { DECLARED_NEED: 1, CONSUMPTION_TOTAL: 2 }, P17: { DECLARED_NEED: 2, CONSUMPTION_TOTAL: 1 }, P18: { DECLARED_NEED: 2, CONSUMPTION_TOTAL: 0 } },
  quantityStep: 250, // cantidades en múltiplos de 250 ML o 250 G
  quantityMaxSteps: 80, // hasta 20 000 ML / 20 000 G por aportación
  threshold: 3,
};

/** PRNG determinista (mulberry32) a partir de la semilla. */
function prng(label) {
  let state = createHash("sha256").update(`${SEED}:${label}`).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UUID v4 determinista por etiqueta. */
function uuid(label) {
  const h = createHash("sha256").update(`${SEED}:id:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  const prisma = new PrismaClient();
  const tenantId = uuid("tenant");
  if (await prisma.tenant.findUnique({ where: { id: tenantId } })) {
    throw new Error("Refused: DS-V tenant already exists in this database (use a new database)");
  }
  const hash = await bcrypt.hash(env.EVAL_PASSWORD, 10);
  const unusable = `unusable-${randomBytes(16).toString("hex")}`;
  const now = new Date("2026-10-16T12:00:00.000Z");

  await prisma.tenant.create({ data: { id: tenantId, name: "Sindicato DS-V sintético", slug: `dsv-${tenantId.slice(0, 8)}` } });
  const account = async (key, name, email, role, passwordHash) => {
    const userId = uuid(`user:${key}`);
    const memberId = uuid(`member:${key}`);
    await prisma.user.create({
      data: { id: userId, tenantId, name, email, passwordHash, role, members: { create: { id: memberId, tenantId, role } } },
    });
    return { userId, memberId };
  };
  await account("directiva", "Directiva DS-V", "directiva@dsv.example.test", "DIRECTIVA", hash);
  await account("admin", "Presidente DS-V", "presidente@dsv.example.test", "ADMINISTRADOR", hash);
  const farmers = [];
  for (let i = 1; i <= SPEC.farmers; i += 1) {
    const label = String(i).padStart(2, "0");
    farmers.push({ index: i, ...(await account(`F${label}`, `Agricultor DS-V ${label}`, `f${label}@dsv.example.test`, "AGRICULTOR", unusable)) });
  }

  const products = [];
  for (let i = 1; i <= SPEC.products; i += 1) {
    const liquid = i <= SPEC.liquids;
    const label = String(i).padStart(2, "0");
    const product = { key: `P${label}`, id: uuid(`product:${label}`), unit: liquid ? "L" : "kg", baseUnit: liquid ? "ML" : "G" };
    await prisma.product.create({ data: { id: product.id, tenantId, name: `Producto DS-V ${label}`, unit: product.unit } });
    products.push(product);
  }

  const campaigns = [];
  for (let i = 1; i <= SPEC.campaigns; i += 1) {
    const campaign = { key: `C${i}`, id: uuid(`campaign:${i}`) };
    await prisma.agriculturalCampaign.create({
      data: {
        id: campaign.id, tenantId, name: `Campaña DS-V ${i} (sintética)`, status: "ABIERTA", isActive: i === 1,
        startDate: new Date(`2026-0${i * 3}-01T00:00:00.000Z`),
      },
    });
    campaigns.push(campaign);
  }

  // Aportaciones por campaña y tipo: un subconjunto determinista de Members,
  // cada uno con 1–6 productos comunes distintos; después, los productos
  // raros reciben exactamente sus aportantes entre Members que aún tienen
  // menos de 6 productos. Los productos vacíos no reciben ninguno.
  const byKey = new Map(products.map((p) => [p.key, p]));
  const rare = Object.keys(SPEC.rareProducts);
  const common = products.filter((p) => !rare.includes(p.key) && !SPEC.emptyProducts.includes(p.key));
  const rows = [];
  const checks = [];
  for (const campaign of campaigns) {
    for (const [projectionType, size] of [["DECLARED_NEED", SPEC.needMembers], ["CONSUMPTION_TOTAL", SPEC.consumptionMembers]]) {
      const random = prng(`members:${campaign.key}:${projectionType}`);
      const members = shuffle(farmers, random).slice(0, size);
      const chosen = new Map();
      for (const farmer of members) {
        const [min, max] = SPEC.productsPerMember;
        const n = min + Math.floor(random() * (max - min + 1));
        chosen.set(farmer.index, shuffle(common, random).slice(0, n));
      }
      for (const key of rare) {
        const wanted = SPEC.rareProducts[key][projectionType];
        const candidates = shuffle(members, random).filter((m) => chosen.get(m.index).length < SPEC.productsPerMember[1]);
        for (const farmer of candidates.slice(0, wanted)) chosen.get(farmer.index).push(byKey.get(key));
      }
      for (const farmer of members) {
        for (const product of chosen.get(farmer.index)) {
          const quantityBase = BigInt(SPEC.quantityStep * (1 + Math.floor(random() * SPEC.quantityMaxSteps)));
          rows.push({ campaign, product, projectionType, farmer, quantityBase });
        }
      }
      const perMember = [...chosen.values()].map((list) => list.length);
      checks.push({
        campaign: campaign.key, projectionType, members: chosen.size,
        products_per_member: [Math.min(...perMember), Math.max(...perMember)],
      });
    }
  }
  // La especificación se comprueba sobre las filas generadas; si no se cumple, no se siembra nada más.
  const cellsOf = (c) => {
    const cells = new Map();
    for (const r of rows.filter((x) => x.campaign.key === c)) {
      const key = `${r.product.key}:${r.projectionType}`;
      cells.set(key, (cells.get(key) ?? new Set()).add(r.farmer.index));
    }
    return cells;
  };
  const perCampaign = {};
  for (const campaign of campaigns) {
    const cells = cellsOf(campaign.key);
    const productsWithData = new Set([...cells.keys()].map((k) => k.split(":")[0]));
    const underK = [...cells.entries()].filter(([, m]) => m.size < SPEC.threshold).map(([k, m]) => `${k}=${m.size}`).sort();
    const contributors = (type) => new Set(rows.filter((r) => r.campaign.key === campaign.key && r.projectionType === type).map((r) => r.farmer.index)).size;
    perCampaign[campaign.key] = {
      need_members: contributors("DECLARED_NEED"),
      consumption_members: contributors("CONSUMPTION_TOTAL"),
      products_without_data: products.filter((p) => !productsWithData.has(p.key)).map((p) => p.key),
      cells: cells.size,
      cells_under_k: underK,
      products_under_k: [...new Set(underK.map((k) => k.split(":")[0]))],
    };
    const pc = perCampaign[campaign.key];
    if (pc.need_members !== SPEC.needMembers || pc.consumption_members !== SPEC.consumptionMembers) throw new Error(`spec: members ${campaign.key}`);
    if (pc.products_without_data.length < 2) throw new Error(`spec: products without data ${campaign.key}`);
    if (pc.products_under_k.length < 3) throw new Error(`spec: products under k ${campaign.key}`);
  }
  for (const c of checks) {
    if (c.products_per_member[0] < SPEC.productsPerMember[0] || c.products_per_member[1] > SPEC.productsPerMember[1]) throw new Error("spec: products per member");
  }

  // ClientRegistration por agricultor que aporta (como en Sync v1) y una
  // intención PUBLISH aplicada por aportación.
  const registered = new Set();
  for (const row of rows) {
    if (registered.has(row.farmer.memberId)) continue;
    registered.add(row.farmer.memberId);
    await prisma.clientRegistration.create({
      data: { tenantId, memberId: row.farmer.memberId, clientIdHash: createHash("sha256").update(`${SEED}:client:${row.farmer.index}`).digest("hex") },
    });
  }
  const batch = 200;
  for (let start = 0; start < rows.length; start += batch) {
    const slice = rows.slice(start, start + batch);
    await prisma.$transaction(async (tx) => {
      for (const row of slice) {
        const label = `${row.campaign.key}:${row.product.key}:${row.projectionType}:${row.farmer.index}`;
        const contributionId = uuid(`contribution:${label}`);
        const operationId = uuid(`operation:${label}`);
        await tx.syncV1Contribution.create({
          data: {
            id: contributionId, tenantId, memberId: row.farmer.memberId, projectionType: row.projectionType,
            campaignId: row.campaign.id, productId: row.product.id, baseUnit: row.product.baseUnit,
            status: "NEVER_PUBLISHED",
          },
        });
        await tx.syncV1OperationJournal.create({
          data: {
            tenantId, memberId: row.farmer.memberId, operationId, projectionType: row.projectionType, action: "PUBLISH",
            fingerprint: randomBytes(32), fingerprintKeyVersion: 1, processingState: "FINAL", outcome: "APPLIED",
            disposition: "RETIRE_FROM_OUTBOX", resultCode: "OK", serverAcceptedAt: now,
            contributionId, contributionSequence: 1,
          },
        });
        await tx.syncV1Contribution.update({
          where: { id: contributionId },
          data: { status: "ACTIVE", headOperationId: operationId, quantityBase: row.quantityBase, lastSequence: 1, acceptedAt: now },
        });
      }
    });
  }

  // Huella del dataset: filas canónicas ordenadas (sin ids aleatorios).
  const canonical = rows
    .map((r) => [r.campaign.key, r.product.key, r.product.baseUnit, r.projectionType, `F${String(r.farmer.index).padStart(2, "0")}`, r.quantityBase.toString()].join(","))
    .sort();
  const counts = {
    farmers: await prisma.member.count({ where: { tenantId, role: "AGRICULTOR" } }),
    institutional: await prisma.member.count({ where: { tenantId, role: { in: ["DIRECTIVA", "ADMINISTRADOR"] } } }),
    products: await prisma.product.count({ where: { tenantId } }),
    campaigns: await prisma.agriculturalCampaign.count({ where: { tenantId } }),
    contributions: await prisma.syncV1Contribution.count({ where: { tenantId, status: "ACTIVE" } }),
    journal: await prisma.syncV1OperationJournal.count({ where: { tenantId } }),
    contributing_farmers: registered.size,
  };
  await prisma.$disconnect();
  process.stdout.write(`${JSON.stringify({
    seed: SEED,
    generator_sha256: createHash("sha256").update(readFileSync(__filename)).digest("hex"),
    dataset_sha256: createHash("sha256").update(canonical.join("\n")).digest("hex"),
    spec: SPEC,
    tenant: tenantId,
    campaigns: Object.fromEntries(campaigns.map((c) => [c.key, c.id])),
    counts,
    per_campaign: perCampaign,
    per_type: checks,
    accounts: { directiva: "directiva@dsv.example.test", administrador: "presidente@dsv.example.test" },
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
