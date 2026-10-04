import { RAIN_STATIONS, ROAD_FLOOD_STATIONS, WATER_STATIONS } from "./stations";
import type { BmaLiveSnapshot, RainStation, RoadFloodStation, Severity, WaterStation } from "./types";

const SOURCES = {
  rain: "https://weather.bangkok.go.th/LastData/IndexRain",
  water: "https://weather.bangkok.go.th/LastData/IndexWater",
  roadFlood: "https://weather.bangkok.go.th/LastData/IndexFlood",
} as const;

const FALLBACKS = {
  rain: "https://weather.bangkok.go.th/rain",
  water: "https://weather.bangkok.go.th/Water/",
  roadFlood: "https://weather.bangkok.go.th/floodbangkok",
} as const;

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html))) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      cells.push(decodeHtml(cellMatch[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parseNumber(value?: string): number | null {
  if (!value || value === "-" || value === "–") return null;
  const cleaned = value.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseThaiDateTime(value: string): string | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, dd, mm, rawYear, hh, min] = match;
  const buddhistYear = Number(rawYear);
  const year = buddhistYear >= 2400 ? buddhistYear - 543 : buddhistYear;
  const iso = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh.padStart(2, "0")}:${min}:00+07:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isStale(observedAt: string | null, maxAgeHours = 3) {
  if (!observedAt) return false;
  return Date.now() - new Date(observedAt).getTime() > maxAgeHours * 60 * 60 * 1000;
}

function severityFromBmaStatus(status: string): Severity {
  if (/ขัดข้อง|ปิดระบบ|ปรับปรุง|ข้อมูลเก่า/.test(status)) return "OFFLINE";
  if (/วิกฤต|น้ำท่วม$/.test(status)) return "CRITICAL";
  if (/เตือนภัย/.test(status)) return "WARNING";
  if (/น้ำท่วมขังเล็กน้อย/.test(status)) return "WATCH";
  if (/ปกติ/.test(status)) return "NORMAL";
  return "UNKNOWN";
}

function rainfallSeverity(rain1h: number | null, sourceStatus: string): Severity {
  const source = severityFromBmaStatus(sourceStatus);
  if (source === "OFFLINE") return "OFFLINE";
  if (rain1h == null) return "UNKNOWN";
  if (rain1h > 90) return "CRITICAL";
  if (rain1h > 35) return "WARNING";
  if (rain1h > 10) return "WATCH";
  return "NORMAL";
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ThonburiFloodWatch/0.3; +https://thonburi-flood-watch.vercel.app)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.7",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchFirst(urls: string[]) {
  const failures: string[] = [];
  for (const url of urls) {
    try {
      return await fetchHtml(url);
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : "fetch failed"}`);
    }
  }
  throw new Error(failures.join(" | "));
}

function byCode(rows: string[][]) {
  return new Map(rows.filter((row) => row[0]).map((row) => [row[0].trim(), row]));
}

function staleStatus(status: string, observedAt: string | null) {
  return isStale(observedAt) ? `${status || "ไม่ทราบสถานะ"} • ข้อมูลเก่า` : status;
}

function parseRain(html: string): RainStation[] {
  const rows = byCode(extractRows(html));
  return RAIN_STATIONS.map((meta) => {
    const row = rows.get(meta.code);
    if (!row) {
      return {
        ...meta,
        kind: "RAIN" as const,
        observedAt: null,
        observedAtRaw: "",
        sourceStatus: "ไม่พบข้อมูล",
        rain5m: null, rain15m: null, rain30m: null, rain1h: null,
        rain3h: null, rain6h: null, rain12h: null, rain24h: null,
        severity: "OFFLINE" as const,
      };
    }

    const observedAtRaw = row[3] ?? "";
    const observedAt = parseThaiDateTime(observedAtRaw);
    const sourceStatus = staleStatus(row[4] ?? "", observedAt);
    const rain1h = parseNumber(row[8]);
    return {
      ...meta,
      name: row[2] || meta.name,
      district: row[1] || meta.district,
      kind: "RAIN" as const,
      observedAt,
      observedAtRaw,
      sourceStatus,
      rain5m: parseNumber(row[5]),
      rain15m: parseNumber(row[6]),
      rain30m: parseNumber(row[7]),
      rain1h,
      rain3h: parseNumber(row[9]),
      rain6h: parseNumber(row[10]),
      rain12h: parseNumber(row[11]),
      rain24h: parseNumber(row[12]),
      severity: rainfallSeverity(rain1h, sourceStatus),
    };
  });
}

function parseWater(html: string): WaterStation[] {
  const rows = byCode(extractRows(html));
  return WATER_STATIONS.map((meta) => {
    const row = rows.get(meta.code);
    if (!row) {
      return {
        ...meta,
        kind: "WATER" as const,
        observedAt: null,
        observedAtRaw: "",
        sourceStatus: "ไม่พบข้อมูล",
        levelInside: null,
        levelOutside: null,
        riverLevel: null,
        severity: "OFFLINE" as const,
      };
    }

    const observedAtRaw = row[3] ?? "";
    const observedAt = parseThaiDateTime(observedAtRaw);
    const sourceStatus = staleStatus(row[4] ?? "", observedAt);
    return {
      ...meta,
      name: row[2] || meta.name,
      kind: "WATER" as const,
      observedAt,
      observedAtRaw,
      sourceStatus,
      levelInside: parseNumber(row[5]),
      levelOutside: parseNumber(row[6]),
      riverLevel: parseNumber(row[7]),
      severity: severityFromBmaStatus(sourceStatus),
    };
  });
}

function looksLikeStatus(value: string) {
  return /ปกติ|ขัดข้อง|ปิดระบบ|ปรับปรุง|เตือนภัย|วิกฤต|น้ำท่วม/.test(value);
}

function parseRoadFlood(html: string): RoadFloodStation[] {
  const rows = byCode(extractRows(html));
  return ROAD_FLOOD_STATIONS.map((meta) => {
    const row = rows.get(meta.code);
    if (!row) {
      return {
        ...meta,
        kind: "ROAD_FLOOD" as const,
        observedAt: null,
        observedAtRaw: "",
        sourceStatus: "ไม่พบข้อมูล",
        depthCm: null,
        severity: "OFFLINE" as const,
      };
    }

    const observedAtRaw = row[3] ?? "";
    const observedAt = parseThaiDateTime(observedAtRaw);
    const lastDataLayout = looksLikeStatus(row[4] ?? "");
    const rawStatus = lastDataLayout ? (row[4] ?? "") : (row[5] ?? "");
    const sourceStatus = staleStatus(rawStatus, observedAt);
    const depthCm = parseNumber(lastDataLayout ? row[6] : row[4]);

    return {
      ...meta,
      road: row[1] || meta.road,
      name: row[2] || meta.name,
      kind: "ROAD_FLOOD" as const,
      observedAt,
      observedAtRaw,
      sourceStatus,
      depthCm,
      severity: severityFromBmaStatus(sourceStatus),
    };
  });
}

function missingCount<T extends { sourceStatus: string }>(stations: T[]) {
  return stations.filter((station) => station.sourceStatus === "ไม่พบข้อมูล").length;
}

function offlineRain(): RainStation[] {
  return RAIN_STATIONS.map((meta) => ({
    ...meta,
    kind: "RAIN" as const,
    observedAt: null,
    observedAtRaw: "",
    sourceStatus: "แหล่งข้อมูลขัดข้อง",
    rain5m: null, rain15m: null, rain30m: null, rain1h: null,
    rain3h: null, rain6h: null, rain12h: null, rain24h: null,
    severity: "OFFLINE" as const,
  }));
}

function offlineWater(): WaterStation[] {
  return WATER_STATIONS.map((meta) => ({
    ...meta,
    kind: "WATER" as const,
    observedAt: null,
    observedAtRaw: "",
    sourceStatus: "แหล่งข้อมูลขัดข้อง",
    levelInside: null,
    levelOutside: null,
    riverLevel: null,
    severity: "OFFLINE" as const,
  }));
}

function offlineRoad(): RoadFloodStation[] {
  return ROAD_FLOOD_STATIONS.map((meta) => ({
    ...meta,
    kind: "ROAD_FLOOD" as const,
    observedAt: null,
    observedAtRaw: "",
    sourceStatus: "แหล่งข้อมูลขัดข้อง",
    depthCm: null,
    severity: "OFFLINE" as const,
  }));
}

export async function getBmaLiveSnapshot(): Promise<BmaLiveSnapshot> {
  const errors: string[] = [];
  const [rainResult, waterResult, roadResult] = await Promise.allSettled([
    fetchFirst([SOURCES.rain, FALLBACKS.rain]),
    fetchFirst([SOURCES.water, FALLBACKS.water]),
    fetchFirst([SOURCES.roadFlood, FALLBACKS.roadFlood]),
  ]);

  let rain: RainStation[] = [];
  let water: WaterStation[] = [];
  let roadFlood: RoadFloodStation[] = [];

  if (rainResult.status === "fulfilled") {
    rain = parseRain(rainResult.value);
    const missing = missingCount(rain);
    if (missing) errors.push(`BMA Rain: ไม่พบ ${missing} สถานีเป้าหมาย`);
  } else {
    rain = offlineRain();
    errors.push(`BMA Rain: ${rainResult.reason instanceof Error ? rainResult.reason.message : "fetch failed"}`);
  }

  if (waterResult.status === "fulfilled") {
    water = parseWater(waterResult.value);
    const missing = missingCount(water);
    if (missing) errors.push(`BMA Water: ไม่พบ ${missing} สถานีเป้าหมาย`);
  } else {
    water = offlineWater();
    errors.push(`BMA Water: ${waterResult.reason instanceof Error ? waterResult.reason.message : "fetch failed"}`);
  }

  if (roadResult.status === "fulfilled") {
    roadFlood = parseRoadFlood(roadResult.value);
    const missing = missingCount(roadFlood);
    if (missing) errors.push(`BMA Road Flood: ไม่พบ ${missing} สถานีเป้าหมาย`);
  } else {
    roadFlood = offlineRoad();
    errors.push(`BMA Road Flood: ${roadResult.reason instanceof Error ? roadResult.reason.message : "fetch failed"}`);
  }

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    rain,
    water,
    roadFlood,
    errors,
    sources: SOURCES,
  };
}
