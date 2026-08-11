-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AGRICULTOR', 'DIRECTIVA', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "StockMovementReasonType" AS ENUM ('COMPRA', 'ENTRADA_SIMPLE', 'APLICACION', 'PERDIDA_DERRAME', 'VENCIMIENTO', 'PRESTAMO_ENTREGA', 'DEVOLUCION', 'AJUSTE', 'OTRO');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANIFICADA', 'ABIERTA', 'CERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PlotStatus" AS ENUM ('ACTIVA', 'INACTIVA');

-- CreateEnum
CREATE TYPE "CropAssignmentStatus" AS ENUM ('PLANIFICADO', 'ACTIVO', 'CAMBIADO', 'CERRADO');

-- CreateEnum
CREATE TYPE "InventoryLotStatus" AS ENUM ('DISPONIBLE', 'AGOTADO', 'VENCIDO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "AgrochemicalApplicationStatus" AS ENUM ('REGISTRADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('VENCIMIENTO_LOTE', 'PAGO_PROXIMO', 'APLICACION', 'COMPRA_PROGRAMADA', 'STOCK_BAJO', 'CIERRE_CAMPANA');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('PENDIENTE', 'COMPLETADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREAR', 'ACTUALIZAR', 'INACTIVAR', 'ELIMINAR', 'ABRIR_CAMPANA', 'CERRAR_CAMPANA', 'AJUSTAR_STOCK', 'REGISTRAR_PAGO', 'SINCRONIZAR', 'OTRO');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('BORRADOR', 'PROGRAMADA', 'CONFIRMADA', 'RECIBIDA_PARCIAL', 'RECIBIDA', 'CERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('INDIVIDUAL', 'CONJUNTA');

-- CreateEnum
CREATE TYPE "PurchasePaymentMode" AS ENUM ('CONTADO', 'CREDITO');

-- CreateEnum
CREATE TYPE "PurchaseParticipantStatus" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "SyncOperationStatus" AS ENUM ('PENDIENTE', 'APLICADA', 'CONFLICTO', 'RECHAZADA');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'AGRICULTOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commercialName" TEXT,
    "activeIngredient" TEXT,
    "category" TEXT,
    "toxicologicalCategory" TEXT,
    "safetyDataSheetUrl" TEXT,
    "safetyDataSheetName" TEXT,
    "safetyInstructions" TEXT,
    "qrCodeValue" TEXT,
    "unit" TEXT NOT NULL,
    "minimumStock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currentStock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expirationWarningDays" INTEGER NOT NULL DEFAULT 90,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgriculturalCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PLANIFICADA',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "estimatedEndDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "closedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgriculturalCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "area" DECIMAL(65,30),
    "areaUnit" TEXT NOT NULL DEFAULT 'ha',
    "status" "PlotStatus" NOT NULL DEFAULT 'ACTIVA',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variety" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlotCropAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "CropAssignmentStatus" NOT NULL DEFAULT 'ACTIVO',
    "plantedArea" DECIMAL(65,30),
    "plantedAt" TIMESTAMP(3),
    "changedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlotCropAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "campaignId" TEXT,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "purchaseItemId" TEXT,
    "lotNumber" TEXT,
    "expirationDate" TIMESTAMP(3),
    "initialQuantity" DECIMAL(65,30) NOT NULL,
    "currentQuantity" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30),
    "status" "InventoryLotStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "qrCodeValue" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "campaignId" TEXT,
    "productId" TEXT NOT NULL,
    "inventoryLotId" TEXT,
    "warehouseId" TEXT,
    "plotId" TEXT,
    "cropId" TEXT,
    "applicationId" TEXT,
    "userId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "reasonType" "StockMovementReasonType",
    "quantity" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgrochemicalApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "appliedById" TEXT,
    "plotId" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "plotCropAssignmentId" TEXT,
    "productId" TEXT NOT NULL,
    "inventoryLotId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "dose" TEXT,
    "targetPest" TEXT,
    "weatherConditions" TEXT,
    "responsibleName" TEXT,
    "notes" TEXT,
    "status" "AgrochemicalApplicationStatus" NOT NULL DEFAULT 'REGISTRADA',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgrochemicalApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "supplierId" TEXT NOT NULL,
    "createdById" TEXT,
    "type" "PurchaseType" NOT NULL DEFAULT 'INDIVIDUAL',
    "paymentMode" "PurchasePaymentMode" NOT NULL DEFAULT 'CONTADO',
    "status" "PurchaseStatus" NOT NULL DEFAULT 'BORRADOR',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItemAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseItemAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseParticipant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PurchaseParticipantStatus" NOT NULL DEFAULT 'PENDIENTE',
    "requestedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allocatedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayableAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "purchaseId" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "PayableStatus" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayableAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "payableAccountId" TEXT NOT NULL,
    "registeredById" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "userId" TEXT,
    "clientId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityId" TEXT,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncOperationStatus" NOT NULL DEFAULT 'PENDIENTE',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "ownerUserId" TEXT,
    "type" "CalendarEventType" NOT NULL,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'PENDIENTE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "sourceEntity" TEXT,
    "sourceEntityId" TEXT,
    "isAutoGenerated" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "actorUserId" TEXT,
    "ownerUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncConflict" (
    "id" TEXT NOT NULL,
    "syncOperationId" TEXT NOT NULL,
    "serverSnapshot" JSONB NOT NULL,
    "clientSnapshot" JSONB NOT NULL,
    "resolvedPayload" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandForecast" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "predictedDemand" DECIMAL(65,30) NOT NULL,
    "confidence" DECIMAL(65,30),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_isActive_idx" ON "Product"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_name_key" ON "Product"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_qrCodeValue_key" ON "Product"("tenantId", "qrCodeValue");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_isActive_idx" ON "Supplier"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_name_key" ON "Supplier"("tenantId", "name");

-- CreateIndex
CREATE INDEX "AgriculturalCampaign_tenantId_status_idx" ON "AgriculturalCampaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AgriculturalCampaign_tenantId_isActive_idx" ON "AgriculturalCampaign"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgriculturalCampaign_tenantId_name_key" ON "AgriculturalCampaign"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Plot_tenantId_ownerUserId_status_idx" ON "Plot"("tenantId", "ownerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Plot_tenantId_ownerUserId_name_key" ON "Plot"("tenantId", "ownerUserId", "name");

-- CreateIndex
CREATE INDEX "Crop_tenantId_isActive_idx" ON "Crop"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Crop_tenantId_name_key" ON "Crop"("tenantId", "name");

-- CreateIndex
CREATE INDEX "PlotCropAssignment_tenantId_ownerUserId_idx" ON "PlotCropAssignment"("tenantId", "ownerUserId");

-- CreateIndex
CREATE INDEX "PlotCropAssignment_tenantId_campaignId_idx" ON "PlotCropAssignment"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "PlotCropAssignment_plotId_cropId_idx" ON "PlotCropAssignment"("plotId", "cropId");

-- CreateIndex
CREATE UNIQUE INDEX "PlotCropAssignment_campaignId_plotId_key" ON "PlotCropAssignment"("campaignId", "plotId");

-- CreateIndex
CREATE INDEX "Warehouse_tenantId_idx" ON "Warehouse"("tenantId");

-- CreateIndex
CREATE INDEX "Warehouse_ownerUserId_idx" ON "Warehouse"("ownerUserId");

-- CreateIndex
CREATE INDEX "InventoryLot_tenantId_ownerUserId_idx" ON "InventoryLot"("tenantId", "ownerUserId");

-- CreateIndex
CREATE INDEX "InventoryLot_tenantId_campaignId_idx" ON "InventoryLot"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "InventoryLot_productId_idx" ON "InventoryLot"("productId");

-- CreateIndex
CREATE INDEX "InventoryLot_expirationDate_idx" ON "InventoryLot"("expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_tenantId_qrCodeValue_key" ON "InventoryLot"("tenantId", "qrCodeValue");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_ownerUserId_occurredAt_idx" ON "StockMovement"("tenantId", "ownerUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_campaignId_idx" ON "StockMovement"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_inventoryLotId_idx" ON "StockMovement"("inventoryLotId");

-- CreateIndex
CREATE INDEX "StockMovement_plotId_idx" ON "StockMovement"("plotId");

-- CreateIndex
CREATE INDEX "StockMovement_applicationId_idx" ON "StockMovement"("applicationId");

-- CreateIndex
CREATE INDEX "AgrochemicalApplication_tenantId_ownerUserId_appliedAt_idx" ON "AgrochemicalApplication"("tenantId", "ownerUserId", "appliedAt");

-- CreateIndex
CREATE INDEX "AgrochemicalApplication_tenantId_campaignId_idx" ON "AgrochemicalApplication"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "AgrochemicalApplication_plotId_cropId_idx" ON "AgrochemicalApplication"("plotId", "cropId");

-- CreateIndex
CREATE INDEX "AgrochemicalApplication_productId_idx" ON "AgrochemicalApplication"("productId");

-- CreateIndex
CREATE INDEX "AgrochemicalApplication_inventoryLotId_idx" ON "AgrochemicalApplication"("inventoryLotId");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_type_status_idx" ON "Purchase"("tenantId", "type", "status");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_campaignId_idx" ON "Purchase"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseItem_tenantId_purchaseId_idx" ON "PurchaseItem"("tenantId", "purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

-- CreateIndex
CREATE INDEX "PurchaseItemAllocation_tenantId_userId_idx" ON "PurchaseItemAllocation"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseItemAllocation_purchaseItemId_userId_key" ON "PurchaseItemAllocation"("purchaseItemId", "userId");

-- CreateIndex
CREATE INDEX "PurchaseParticipant_tenantId_userId_idx" ON "PurchaseParticipant"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseParticipant_purchaseId_userId_key" ON "PurchaseParticipant"("purchaseId", "userId");

-- CreateIndex
CREATE INDEX "PayableAccount_tenantId_status_dueDate_idx" ON "PayableAccount"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "PayableAccount_tenantId_campaignId_idx" ON "PayableAccount"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "PayableAccount_purchaseId_idx" ON "PayableAccount"("purchaseId");

-- CreateIndex
CREATE INDEX "PayableAccount_responsibleUserId_idx" ON "PayableAccount"("responsibleUserId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_paidAt_idx" ON "Payment"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_campaignId_idx" ON "Payment"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "Payment_payableAccountId_idx" ON "Payment"("payableAccountId");

-- CreateIndex
CREATE INDEX "SyncOperation_tenantId_clientId_status_idx" ON "SyncOperation"("tenantId", "clientId", "status");

-- CreateIndex
CREATE INDEX "SyncOperation_tenantId_campaignId_idx" ON "SyncOperation"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "SyncOperation_entityName_entityId_idx" ON "SyncOperation"("entityName", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncOperation_tenantId_userId_clientId_entityId_key" ON "SyncOperation"("tenantId", "userId", "clientId", "entityId");

-- CreateIndex
CREATE INDEX "CalendarEvent_tenantId_eventDate_idx" ON "CalendarEvent"("tenantId", "eventDate");

-- CreateIndex
CREATE INDEX "CalendarEvent_tenantId_ownerUserId_eventDate_idx" ON "CalendarEvent"("tenantId", "ownerUserId", "eventDate");

-- CreateIndex
CREATE INDEX "CalendarEvent_tenantId_campaignId_type_idx" ON "CalendarEvent"("tenantId", "campaignId", "type");

-- CreateIndex
CREATE INDEX "CalendarEvent_sourceEntity_sourceEntityId_idx" ON "CalendarEvent"("sourceEntity", "sourceEntityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_campaignId_idx" ON "AuditLog"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_actorUserId_idx" ON "AuditLog"("tenantId", "actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_ownerUserId_idx" ON "AuditLog"("tenantId", "ownerUserId");

-- CreateIndex
CREATE INDEX "AuditLog_entityName_entityId_idx" ON "AuditLog"("entityName", "entityId");

-- CreateIndex
CREATE INDEX "DemandForecast_tenantId_productId_generatedAt_idx" ON "DemandForecast"("tenantId", "productId", "generatedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgriculturalCampaign" ADD CONSTRAINT "AgriculturalCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgriculturalCampaign" ADD CONSTRAINT "AgriculturalCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgriculturalCampaign" ADD CONSTRAINT "AgriculturalCampaign_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crop" ADD CONSTRAINT "Crop_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotCropAssignment" ADD CONSTRAINT "PlotCropAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotCropAssignment" ADD CONSTRAINT "PlotCropAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotCropAssignment" ADD CONSTRAINT "PlotCropAssignment_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotCropAssignment" ADD CONSTRAINT "PlotCropAssignment_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotCropAssignment" ADD CONSTRAINT "PlotCropAssignment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AgrochemicalApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_plotCropAssignmentId_fkey" FOREIGN KEY ("plotCropAssignmentId") REFERENCES "PlotCropAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgrochemicalApplication" ADD CONSTRAINT "AgrochemicalApplication_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItemAllocation" ADD CONSTRAINT "PurchaseItemAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItemAllocation" ADD CONSTRAINT "PurchaseItemAllocation_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItemAllocation" ADD CONSTRAINT "PurchaseItemAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseParticipant" ADD CONSTRAINT "PurchaseParticipant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseParticipant" ADD CONSTRAINT "PurchaseParticipant_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseParticipant" ADD CONSTRAINT "PurchaseParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableAccount" ADD CONSTRAINT "PayableAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableAccount" ADD CONSTRAINT "PayableAccount_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableAccount" ADD CONSTRAINT "PayableAccount_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableAccount" ADD CONSTRAINT "PayableAccount_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payableAccountId_fkey" FOREIGN KEY ("payableAccountId") REFERENCES "PayableAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgriculturalCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncConflict" ADD CONSTRAINT "SyncConflict_syncOperationId_fkey" FOREIGN KEY ("syncOperationId") REFERENCES "SyncOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandForecast" ADD CONSTRAINT "DemandForecast_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandForecast" ADD CONSTRAINT "DemandForecast_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

