export type TmdSourceProbe = {
  ok: boolean;
  sourceUrl: string;
  checkedAt: string;
  error?: string;
};

export type TmdAwsRainContext = {
  ok: boolean;
  measurementAvailable: boolean;
  sourceUrl: string;
  fetchedAt: string;
  rain15mMm: number | null;
  rain1hMm: number | null;
  rainTodayMm: number | null;
  observedAtRaw: string;
  error?: string;
};

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
  aws: TmdAwsRainContext;
  radar: TmdSourceProbe;
  nowcast: TmdSourceProbe;
  error?: string;
};
