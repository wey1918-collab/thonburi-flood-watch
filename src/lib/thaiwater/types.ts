import type { Severity } from "@/lib/bma/types";

export type ThaiWaterRainContext = {
  stationName: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  observedAt: string | null;
  observedAtRaw: string;
  rain1h: number | null;
  rain24h: number | null;
  agency: string | null;
  stale: boolean;
  severity: Severity;
};

export type ThaiWaterLevelContext = {
  stationName: string;
  stationCode: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  observedAt: string | null;
  observedAtRaw: string;
  levelMslM: number | null;
  situationLevel: number | null;
  bankText: string;
  diffBankM: number | null;
  agency: string | null;
  stale: boolean;
  severity: Severity;
};

export type ThaiWaterRoadContext = {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  observedAt: string | null;
  observedAtRaw: string;
  depthCm: number | null;
  stale: boolean;
  severity: Severity;
};

export type ThaiWaterSnapshot = {
  ok: boolean;
  generatedAt: string;
  via: "direct" | "github-relay";
  rain: ThaiWaterRainContext | null;
  water: ThaiWaterLevelContext[];
  roadFlood: ThaiWaterRoadContext[];
  errors: string[];
  sources: {
    rain: string;
    water: string;
    roadFlood: string;
  };
};
