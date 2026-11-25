import { CampaignStatus, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEMO_MARKER, cropNames, farmersSeed, productSeed, qty, upsertUser } from './seed-helpers';

export async function seedBase(prisma: PrismaClient) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: { name: 'Sindicato 19 de Agosto' },
    create: {
      name: 'Sindicato 19 de Agosto',
      slug: 'default',
    },
  });

  const passwordHash = await bcrypt.hash('Admin123!', 12);

  const admin = await upsertUser(prisma, tenant.id, passwordHash, 'Administrador', 'admin@agro.local', UserRole.ADMINISTRADOR);
  const directiva = await upsertUser(prisma, tenant.id, passwordHash, 'Directiva General', 'directiva@agro.local', UserRole.DIRECTIVA);
  const tecnico = await upsertUser(prisma, tenant.id, passwordHash, 'Tecnico Operativo', 'tecnico@agro.local', UserRole.DIRECTIVA);

  const farmers = [];
  for (const [name, email] of farmersSeed) {
    farmers.push(await upsertUser(prisma, tenant.id, passwordHash, name, email, UserRole.AGRICULTOR));
  }

  await prisma.agriculturalCampaign.updateMany({
    where: { tenantId: tenant.id, isActive: true },
    data: { isActive: false },
  });

  const previousCampaign = await prisma.agriculturalCampaign.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Campana Invierno 2025' } },
    update: { status: CampaignStatus.CERRADA, isActive: false },
    create: {
      tenantId: tenant.id,
      name: 'Campana Invierno 2025',
      status: CampaignStatus.CERRADA,
      isActive: false,
      startDate: new Date('2025-05-01T00:00:00.000Z'),
      estimatedEndDate: new Date('2025-09-30T00:00:00.000Z'),
      closedAt: new Date('2025-10-05T00:00:00.000Z'),
      createdById: directiva.id,
      closedById: directiva.id,
      notes: 'Campana cerrada con datos historicos.',
    },
  });

  const activeCampaign = await prisma.agriculturalCampaign.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Campana Verano 2026' } },
    update: { status: CampaignStatus.ABIERTA, isActive: true },
    create: {
      tenantId: tenant.id,
      name: 'Campana Verano 2026',
      status: CampaignStatus.ABIERTA,
      isActive: true,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      estimatedEndDate: new Date('2026-06-30T00:00:00.000Z'),
      createdById: directiva.id,
      notes: 'Campana activa para demostracion completa del flujo.',
    },
  });

  await prisma.agriculturalCampaign.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Campana Invierno 2026' } },
    update: { status: CampaignStatus.PLANIFICADA, isActive: false },
    create: {
      tenantId: tenant.id,
      name: 'Campana Invierno 2026',
      status: CampaignStatus.PLANIFICADA,
      isActive: false,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      estimatedEndDate: new Date('2026-11-30T00:00:00.000Z'),
      createdById: directiva.id,
      notes: 'Campana planificada para reportes y calendario.',
    },
  });

  const marker = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, entityName: 'SeedDemo', entityId: DEMO_MARKER },
  });

  const crops = [];
  for (const name of cropNames) {
    crops.push(
      await prisma.crop.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name } },
        update: { isActive: true },
        create: { tenantId: tenant.id, name },
      }),
    );
  }

  const suppliers = [];
  for (const [index, name] of [
    'Agroservicios San Julian',
    'Insumos Oriente',
    'Casa Agricola El Surco',
    'Agroquimicos Bolivia',
    'Distribuidora Norte Verde',
    'Tecnocampo SRL',
  ].entries()) {
    suppliers.push(
      await prisma.supplier.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name } },
        update: { isActive: true },
        create: {
          tenantId: tenant.id,
          name,
          phone: `7700-10${index}${index}`,
          address: `Av. Agricola bloque ${index + 1}`,
          notes: 'Proveedor demo para compras individuales y conjuntas.',
        },
      }),
    );
  }

  const products = [];
  for (const [index, item] of productSeed.entries()) {
    const [name, category, activeIngredient, toxicology, unit] = item;
    products.push(
      await prisma.product.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name } },
        update: {
          category,
          activeIngredient,
          toxicologicalCategory: toxicology,
          unit,
          isActive: true,
        },
        create: {
          tenantId: tenant.id,
          name,
          commercialName: name,
          activeIngredient,
          category,
          toxicologicalCategory: toxicology,
          safetyDataSheetUrl: `https://example.com/fds/${name.toLowerCase().replaceAll(' ', '-')}.pdf`,
          safetyDataSheetName: `FDS ${name}`,
          safetyInstructions: 'Usar guantes, mascara, lentes y lavar equipo despues de aplicar.',
          qrCodeValue: `QR-PROD-${String(index + 1).padStart(3, '0')}`,
          unit,
          minimumStock: qty(20 + index * 3),
          expirationWarningDays: 90,
        },
      }),
    );
  }

  return {
    tenant,
    admin,
    directiva,
    tecnico,
    farmers,
    previousCampaign,
    activeCampaign,
    marker,
    crops,
    suppliers,
    products,
  };
}

export type SeedBaseContext = Awaited<ReturnType<typeof seedBase>>;
