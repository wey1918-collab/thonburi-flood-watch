export type Severity = "NORMAL" | "WATCH" | "WARNING" | "CRITICAL" | "OFFLINE" | "UNKNOWN";

export type StationMeta = {
  code: string;
  name: string;
  district: string;
  latitude: number;
  longitude: number;
};

export type RainStation = StationMeta & {
  kind: "RAIN";
  observedAt: string | null;
  observedAtRaw: string;
  sourceStatus: string;
  rain5m: number | null;
  rain15m: number | null;
  rain30m: number | null;
  rain1h: number | null;
  rain3h: number | null;
  rain6h: number | null;
  rain12h: number | null;
  rain24h: number | null;
  severity: Severity;
};

export type WaterStation = StationMeta & {
  kind: "WATER";
  observedAt: string | null;
  observedAtRaw: string;
  sourceStatus: string;
  levelInside: number | null;
  levelOutside: number | null;
  riverLevel: number | null;
  severity: Severity;
};

export type RoadFloodStation = StationMeta & {
  kind: "ROAD_FLOOD";
  road: string;
  observedAt: string | null;
  observedAtRaw: string;
  sourceStatus: string;
  depthCm: number | null;
  severity: Severity;
};

export type BmaLiveSnapshot = {
  ok: boolean;
  generatedAt: string;
  rain: RainStation[];
  water: WaterStation[];
  roadFlood: RoadFloodStation[];
  errors: string[];
  sources: {
    rain: string;
    water: string;
    roadFlood: string;
  };
};
