export type RidC29Snapshot = {
  ok: boolean;
  station: "C.29";
  stationName: string;
  flowM3s: number | null;
  previousFlowM3s: number | null;
  changePercent: number | null;
  trend: "RISING" | "FALLING" | "STABLE" | "UNKNOWN";
  observedAt: string | null;
  observedAtRaw: string;
  sourceUrl: string;
  fetchedAt: string;
  stale: boolean;
  error?: string;
};
