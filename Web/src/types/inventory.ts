import type { ApiDateString, DecimalString } from './common';

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  commercialName: string | null;
  activeIngredient: string | null;
  category: string | null;
  toxicologicalCategory: string | null;
  safetyDataSheetUrl: string | null;
  safetyDataSheetName: string | null;
  safetyInstructions: string | null;
  qrCodeValue: string | null;
  unit: string;
  minimumStock: DecimalString;
  expirationWarningDays: number;
  isActive: boolean;
  createdAt: ApiDateString;
  updatedAt: ApiDateString;
}

export interface CreateProductPayload {
  name: string;
  commercialName?: string;
  activeIngredient?: string;
  category?: string;
  toxicologicalCategory?: string | null;
  safetyDataSheetUrl?: string | null;
  safetyDataSheetName?: string | null;
  safetyInstructions?: string | null;
  qrCodeValue?: string | null;
  unit: string;
  minimumStock?: number;
  expirationWarningDays?: number;
}

export interface UpdateProductPayload {
  name?: string;
  commercialName?: string;
  activeIngredient?: string;
  category?: string;
  toxicologicalCategory?: string | null;
  safetyDataSheetUrl?: string | null;
  safetyDataSheetName?: string | null;
  safetyInstructions?: string | null;
  qrCodeValue?: string | null;
  unit?: string;
  minimumStock?: number;
  expirationWarningDays?: number;
}

export interface ListProductsQuery {
  search?: string;
  category?: string;
  isActive?: boolean;
}
