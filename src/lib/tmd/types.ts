export type TmdBangkokForecast = {
  ok: boolean;
  sourceUrl: string;
  fetchedAt: string;
  issuedAtRaw: string;
  periodRaw: string;
  rainChancePercent: number | null;
  heavyRain: boolean;
  gustyWind: boolean;
  minTempC: number | null;
  maxTempC: number | null;
  windText: string;
  summary: string;
  error?: string;
};
