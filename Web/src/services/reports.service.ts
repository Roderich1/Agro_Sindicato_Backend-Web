import { api } from '../lib/axios';
import type { ReportObject, ReportQuery, ReportResponse, ReportValue } from '../types/reports';

type RawReport = ReportObject | ReportObject[];

const isObject = (value: ReportValue | undefined): value is ReportObject =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeReport = (data: RawReport): ReportResponse => {
  if (Array.isArray(data)) {
    return {
      totals: { groups: data.length },
      rows: [],
      sections: data.map((group, index) => ({
        key: String(group.key ?? `Grupo ${index + 1}`),
        rows: Array.isArray(group.rows)
          ? group.rows.filter((row): row is ReportObject => isObject(row))
          : [],
      })),
    };
  }

  return {
    totals: isObject(data.totals) ? data.totals : {},
    rows: Array.isArray(data.rows)
      ? data.rows.filter((row): row is ReportObject => isObject(row))
      : [],
    sections: Object.entries(data)
      .filter(([key, value]) => key !== 'rows' && key !== 'totals' && Array.isArray(value))
      .map(([key, value]) => ({
        key,
        rows: (value as ReportValue[]).filter((row): row is ReportObject => isObject(row)),
      })),
  };
};

const getReport = (path: string, params?: ReportQuery) =>
  api.get<RawReport>(path, { params }).then((r) => normalizeReport(r.data));

export const reportsService = {
  inventoryCurrent: (params?: ReportQuery) => getReport('/reports/inventory/current', params),
  inventoryByCampaign: (params?: ReportQuery) => getReport('/reports/inventory/by-campaign', params),
  inventoryByFarmer: (params?: ReportQuery) => getReport('/reports/inventory/by-farmer', params),
  purchasesByCampaign: (params?: ReportQuery) => getReport('/reports/purchases/by-campaign', params),
  jointPurchases: (params?: ReportQuery) => getReport('/reports/purchases/joint', params),
  applicationsByPlotCrop: (params?: ReportQuery) => getReport('/reports/applications/by-plot-crop', params),
  consumptionByProduct: (params?: ReportQuery) => getReport('/reports/consumption/by-product', params),
  consumptionByCrop: (params?: ReportQuery) => getReport('/reports/consumption/by-crop', params),
  expiredProducts: (params?: ReportQuery) => getReport('/reports/products/expired', params),
  payablesAndPayments: (params?: ReportQuery) => getReport('/reports/payables', params),
  auditByCampaign: (params?: ReportQuery) => getReport('/reports/audit-log', params),
};
