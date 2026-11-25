import { PrismaClient } from '@prisma/client';
import { seedBase } from './seed/seed-base';
import { seedFarmFlows } from './seed/seed-farm-flows';
import { seedJointAndOps } from './seed/seed-joint-and-ops';

const prisma = new PrismaClient();

async function main() {
  const base = await seedBase(prisma);
  if (base.marker) {
    console.log('Seed demo masivo ya estaba cargado. No se duplicaron datos.');
    return;
  }

  const allLots = await seedFarmFlows(prisma, base);
  await seedJointAndOps(prisma, base, allLots);

  console.log(
    `Seed demo masivo completado: ${base.farmers.length} agricultores, ${base.products.length} productos, ${allLots.length} lotes.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
