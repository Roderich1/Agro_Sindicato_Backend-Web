export interface ReportQuery {
  campaignId?: string;
  ownerUserId?: string;
  productId?: string;
  cropId?: string;
  plotId?: string;
  from?: string;
  to?: string;
}

export type ReportCell = string | number | boolean | null;
export type ReportValue = ReportCell | ReportObject | ReportValue[];

export interface ReportObject {
  [key: string]: ReportValue;
}

export interface ReportResponse {
  totals: ReportObject;
  rows: ReportObject[];
  sections: Array<{ key: string; rows: ReportObject[] }>;
}
