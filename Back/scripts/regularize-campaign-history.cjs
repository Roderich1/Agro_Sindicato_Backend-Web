const { PrismaClient } = require("@prisma/client");

function localUrl(input, label) {
  if (!input) throw new Error(`Falta ${label}.`);
  const url = new URL(input);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${label} debe apuntar al entorno local aislado.`);
  }
  return url;
}

async function main(args) {
  const [tenantId, flag, campaignId, ...rest] = args;
  if (!tenantId || rest.length || (flag && (flag !== "--apply" || !campaignId))) {
    throw new Error("Uso: node scripts/regularize-campaign-history.cjs <tenant-id> [--apply <campaign-id>]");
  }
  const dbUrl = localUrl(process.env.AGRO_HISTORY_DATABASE_URL, "AGRO_HISTORY_DATABASE_URL");
  const apiUrl = localUrl(process.env.AGRO_HISTORY_API_URL, "AGRO_HISTORY_API_URL");
  const token = process.env.AGRO_HISTORY_ACCESS_TOKEN;
  if (!token) throw new Error("Falta AGRO_HISTORY_ACCESS_TOKEN.");

  async function request(path, body) {
    const response = await fetch(new URL(`/api/v1/collective/campaigns/${path}`, apiUrl), {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} en ${path}.`);
    return response.json();
  }

  const db = new PrismaClient({ datasourceUrl: dbUrl.toString() });
  try {
    const campaigns = await db.agriculturalCampaign.findMany({
      where: { tenantId, status: "CERRADA", ...(campaignId ? { id: campaignId } : {}) },
      select: { id: true, name: true, closedAt: true, collectiveSeals: { select: { id: true } } },
      orderBy: { id: "asc" },
    });
    const pending = campaigns.filter((campaign) => campaign.collectiveSeals.length === 0);
    const report = [];
    for (const { id, name, closedAt } of pending) {
      const preview = await request(`${id}/close-preview`);
      report.push({
        id, name, closedAt,
        recoverableCells: preview.recoverable_cells,
        cellsWithoutFigure: preview.cells_without_figure,
        currentCoverage: preview.coverage,
      });
    }
    console.log(JSON.stringify({ closedWithoutHistory: pending.length, inspectedAt: new Date(), campaigns: report }, null, 2));
    if (!campaignId) return;
    if (campaigns.length === 0) throw new Error("Campaña cerrada inexistente en el sindicato indicado.");
    if (report.length === 0) {
      console.log("El histórico ya existe.");
      return;
    }
    if (report[0].recoverableCells === 0) throw new Error("Sin cifras recuperables. La campaña queda pendiente.");
    const view = await request(`${campaignId}/seal`);
    if (view.state === "SEALED") {
      console.log("El histórico ya existe.");
      return;
    }
    const result = await request(`${campaignId}/seal`, { confirmed: true, review_ref: view.review.review_ref });
    console.log(JSON.stringify({ created: result.created, history: result.seal?.seal_ref, recordedAt: result.seal?.sealed_at }));
  } finally {
    await db.$disconnect();
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
