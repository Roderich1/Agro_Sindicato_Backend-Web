import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductCatalogUseCase } from './product-catalog.use-case';

describe('ProductCatalogUseCase', () => {
  const tenantId = 'tenant-1';
  const productId = 'product-1';

  function product(overrides: Record<string, unknown> = {}) {
    return {
      id: productId,
      tenantId,
      name: 'Glifosato 48%',
      commercialName: 'Glifosato Max',
      activeIngredient: 'Glifosato',
      category: 'Herbicida',
      toxicologicalCategory: 'II - Moderadamente peligroso',
      safetyDataSheetUrl: 'https://example.com/fds/glifosato.pdf',
      safetyDataSheetName: 'FDS Glifosato 48%',
      safetyInstructions: 'Usar guantes y mascara.',
      qrCodeValue: 'QR-GLIFOSATO-48',
      unit: 'L',
      minimumStock: new Prisma.Decimal('5'),
      currentStock: new Prisma.Decimal('0'),
      expirationWarningDays: 90,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function createUseCase(prismaOverrides: Record<string, unknown>) {
    const prisma = {
      product: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      ...prismaOverrides,
    };

    return {
      prisma,
      useCase: new ProductCatalogUseCase(prisma as never),
    };
  }

  it('creates a product with FDS, toxicology and QR data', async () => {
    const createdProduct = product();
    const { prisma, useCase } = createUseCase({
      product: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdProduct),
      },
    });

    await expect(
      useCase.create(tenantId, {
        name: ' Glifosato 48% ',
        commercialName: ' Glifosato Max ',
        activeIngredient: ' Glifosato ',
        category: ' Herbicida ',
        toxicologicalCategory: ' II - Moderadamente peligroso ',
        safetyDataSheetUrl: ' https://example.com/fds/glifosato.pdf ',
        safetyDataSheetName: ' FDS Glifosato 48% ',
        safetyInstructions: ' Usar guantes y mascara. ',
        qrCodeValue: ' QR-GLIFOSATO-48 ',
        unit: ' L ',
        minimumStock: 5,
        expirationWarningDays: 90,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: productId,
        toxicologicalCategory: 'II - Moderadamente peligroso',
        safetyDataSheetUrl: 'https://example.com/fds/glifosato.pdf',
        safetyDataSheetName: 'FDS Glifosato 48%',
        safetyInstructions: 'Usar guantes y mascara.',
        qrCodeValue: 'QR-GLIFOSATO-48',
        isActive: true,
      }),
    );

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId,
        qrCodeValue: 'QR-GLIFOSATO-48',
      },
    });
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        name: 'Glifosato 48%',
        toxicologicalCategory: 'II - Moderadamente peligroso',
        safetyDataSheetUrl: 'https://example.com/fds/glifosato.pdf',
        safetyDataSheetName: 'FDS Glifosato 48%',
        safetyInstructions: 'Usar guantes y mascara.',
        qrCodeValue: 'QR-GLIFOSATO-48',
      }),
    });
  });

  it('updates technical product data', async () => {
    const existingProduct = product({
      toxicologicalCategory: null,
      safetyDataSheetUrl: null,
      safetyDataSheetName: null,
      safetyInstructions: null,
    });
    const updatedProduct = product({
      toxicologicalCategory: 'III - Ligeramente peligroso',
      safetyDataSheetUrl: 'https://example.com/fds/nueva.pdf',
      safetyDataSheetName: 'FDS Actualizada',
      safetyInstructions: 'Evitar contacto con piel.',
    });
    const { prisma, useCase } = createUseCase({
      product: {
        findFirst: jest.fn().mockResolvedValue(existingProduct),
        update: jest.fn().mockResolvedValue(updatedProduct),
      },
    });

    await expect(
      useCase.update(tenantId, productId, {
        toxicologicalCategory: ' III - Ligeramente peligroso ',
        safetyDataSheetUrl: ' https://example.com/fds/nueva.pdf ',
        safetyDataSheetName: ' FDS Actualizada ',
        safetyInstructions: ' Evitar contacto con piel. ',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        toxicologicalCategory: 'III - Ligeramente peligroso',
        safetyDataSheetUrl: 'https://example.com/fds/nueva.pdf',
        safetyDataSheetName: 'FDS Actualizada',
        safetyInstructions: 'Evitar contacto con piel.',
      }),
    );

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: productId },
      data: expect.objectContaining({
        toxicologicalCategory: 'III - Ligeramente peligroso',
        safetyDataSheetUrl: 'https://example.com/fds/nueva.pdf',
        safetyDataSheetName: 'FDS Actualizada',
        safetyInstructions: 'Evitar contacto con piel.',
      }),
    });
  });

  it('rejects duplicated QR inside the tenant', async () => {
    const duplicatedProduct = product({ id: 'other-product' });
    const { useCase } = createUseCase({
      product: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(duplicatedProduct),
        create: jest.fn(),
      },
    });

    await expect(
      useCase.create(tenantId, {
        name: 'Paraquat',
        unit: 'L',
        qrCodeValue: 'QR-GLIFOSATO-48',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
