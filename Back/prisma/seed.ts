import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Cooperativa Agro Default',
      slug: 'default',
    },
  });

  const passwordHash = await bcrypt.hash('Admin123!', 12);

  await prisma.user.upsert({
    where: { email: 'admin@agro.local' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@agro.local',
      passwordHash,
      role: UserRole.ADMINISTRADOR,
      tenantId: tenant.id,
    },
  });

  console.log('Seed completado: tenant "default" + admin@agro.local creados');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
