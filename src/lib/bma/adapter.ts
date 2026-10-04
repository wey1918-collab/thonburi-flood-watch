import { RAIN_STATIONS, ROAD_FLOOD_STATIONS, WATER_STATIONS } from "./stations";
import type { BmaLiveSnapshot, RainStation, RoadFloodStation, Severity, WaterStation } from "./types";

const API_BASE = "https://flood.bangkok.go.th/api";

const SOURCES = {
  rain: `${API_BASE}/rain/stationstatus_dt`,
  water: `${API_BASE}/mainwater/lastdata/0`,
  roadFlood: `${API_BASE}/flood/stationstatus_dt`,
} as const;

const LEGACY = {
  rain: ["https://weather.bangkok.go.th/LastData/IndexRain", "https://weather.bangkok.go.th/rain"],
  water: ["https://weather.bangkok.go.th/LastData/IndexWater", "https://weather.bangkok.go.th/Water/"],
  roadFlood: ["https://weather.bangkok.go.th/LastData/IndexFlood", "https://weather.bangkok.go.th/floodbangkok"],
} as const;

type ApiRow = Record<string, unknown>;

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

function parseNumber(value?: string | number | null): number | null {
  if (value == null || value === "" || value === "-" || value === "–") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
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

function parseAnyDateTime(value: string): string | null {
  if (!value) return null;
  const thai = parseThaiDateTime(value);
  if (thai) return thai;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isStale(observedAt: string | null, maxAgeHours = 3) {
  if (!observedAt) return false;
  return Date.now() - new Date(observedAt).getTime() > maxAgeHours * 60 * 60 * 1000;
}

function severityFromBmaStatus(status: string): Severity {
  const normalized = status.trim().toLowerCase();
  if (/ขัดข้อง|ปิดระบบ|ปรับปรุง|ข้อมูลเก่า|offline/.test(normalized)) return "OFFLINE";
  if (/critical|วิกฤต|น้ำท่วม$/.test(normalized)) return "CRITICAL";
  if (/warning|เตือนภัย/.test(normalized)) return "WARNING";
  if (/watch|น้ำท่วมขังเล็กน้อย/.test(normalized)) return "WATCH";
  if (/normal|ปกติ/.test(normalized)) return "NORMAL";
  return "UNKNOWN";
}

function apiStatusText(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "normal") return "ปกติ";
  if (normalized === "warning") return "เตือนภัย";
  if (normalized === "critical") return "วิกฤต";
  return status || "ไม่ทราบสถานะ";
}

function rainfallSeverity(rain1h: number | null, sourceStatus: string): Severity {
  const source = severityFromBmaStatus(sourceStatus);
  if (source === "OFFLINE" || source === "CRITICAL" || source === "WARNING") return source;
  if (rain1h == null) return source === "NORMAL" ? "NORMAL" : "UNKNOWN";
  if (rain1h > 90) return "CRITICAL";
  if (rain1h > 35) return "WARNING";
  if (rain1h > 10) return "WATCH";
  return "NORMAL";
}

function staleStatus(status: string, observedAt: string | null) {
  return isStale(observedAt) ? `${status || "ไม่ทราบสถานะ"} • ข้อมูลเก่า` : status;
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ThonburiFloodWatch/0.4; +https://thonburi-flood-watch.vercel.app)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.7",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ThonburiFloodWatch/0.4; +https://thonburi-flood-watch.vercel.app)",
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.7",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchFirstHtml(urls: readonly string[]) {
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

function asRows(payload: unknown): ApiRow[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is ApiRow => typeof item === "object" && item !== null && !Array.isArray(item));
  }
  if (typeof payload !== "object" || payload === null) return [];
  const object = payload as Record<string, unknown>;
  for (const key of ["data", "result", "results", "items", "rows"]) {
    if (Array.isArray(object[key])) return asRows(object[key]);
  }
  return [];
}

function stringValue(row: ApiRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(row: ApiRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number") {
      if (Number.isFinite(value)) return value;
      continue;
    }
    if (typeof value === "string") {
      const parsed = parseNumber(value);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function stationCode(row: ApiRow) {
  return stringValue(row, ["st_code", "station_code", "stationCode", "code", "station"]);
}

function indexApiRows(rows: ApiRow[]) {
  const map = new Map<string, ApiRow>();
  for (const row of rows) {
    const code = stationCode(row);
    if (code) map.set(code, row);
  }
  return map;
}

function nowQueryIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function apiObserved(row: ApiRow) {
  const raw = stringValue(row, ["site_time", "datetime", "date_time", "observed_at", "observedAt", "time"]);
  return { raw, iso: parseAnyDateTime(raw) };
}

function byCode(rows: string[][]) {
  return new Map(rows.filter((row) => row[0]).map((row) => [row[0].trim(), row]));
}

function parseRainLegacy(html: string): RainStation[] {
  const rows = byCode(extractRows(html));
  return RAIN_STATIONS.map((meta) => {
    const row = rows.get(meta.code);
    if (!row) return offlineRainStation(meta, "ไม่พบข้อมูล");

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

function parseWaterLegacy(html: string): WaterStation[] {
  const rows = byCode(extractRows(html));
  return WATER_STATIONS.map((meta) => {
    const row = rows.get(meta.code);
    if (!row) return offlineWaterStation(meta, "ไม่พบข้อมูล");

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

function parseRoadLegacy(html: string): RoadFloodStation[] {
  const rows = byCode(extractRows(html));
  return ROAD_FLOOD_STATIONS.map((meta) => {
    const row = rows.get(meta.code);
    if (!row) return offlineRoadStation(meta, "ไม่พบข้อมูล");

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

function offlineRainStation(meta: (typeof RAIN_STATIONS)[number], status = "แหล่งข้อมูลขัดข้อง"): RainStation {
  return {
    ...meta,
    kind: "RAIN",
    observedAt: null,
    observedAtRaw: "",
    sourceStatus: status,
    rain5m: null,
    rain15m: null,
    rain30m: null,
    rain1h: null,
    rain3h: null,
    rain6h: null,
    rain12h: null,
    rain24h: null,
    severity: "OFFLINE",
  };
}

function offlineWaterStation(meta: (typeof WATER_STATIONS)[number], status = "แหล่งข้อมูลขัดข้อง"): WaterStation {
  return {
    ...meta,
    kind: "WATER",
    observedAt: null,
    observedAtRaw: "",
    sourceStatus: status,
    levelInside: null,
    levelOutside: null,
    riverLevel: null,
    severity: "OFFLINE",
  };
}

function offlineRoadStation(meta: (typeof ROAD_FLOOD_STATIONS)[number], status = "แหล่งข้อมูลขัดข้อง"): RoadFloodStation {
  return {
    ...meta,
    kind: "ROAD_FLOOD",
    observedAt: null,
    observedAtRaw: "",
    sourceStatus: status,
    depthCm: null,
    severity: "OFFLINE",
  };
}

async function fetchRainApi(): Promise<RainStation[]> {
  const url = `${API_BASE}/rain/stationstatus_dt?period=60&datetime=${encodeURIComponent(nowQueryIso())}`;
  const rows = asRows(await fetchJson(url));
  const indexed = indexApiRows(rows);
  const queryObservedAt = new Date().toISOString();

  return RAIN_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row) {
      return {
        ...meta,
        kind: "RAIN" as const,
        observedAt: queryObservedAt,
        observedAtRaw: "ช่วง 60 นาทีล่าสุด",
        sourceStatus: "ปกติ • ไม่พบฝนในช่วง 60 นาทีล่าสุด",
        rain5m: null,
        rain15m: null,
        rain30m: null,
        rain1h: 0,
        rain3h: null,
        rain6h: null,
        rain12h: null,
        rain24h: null,
        severity: "NORMAL" as const,
      };
    }

    const observed = apiObserved(row);
    const rain1h = numberValue(row, ["rain_60", "rain60", "rain60m", "rain_1h", "rain1h", "rf_60", "rf60", "rainfall", "rain", "rf", "value", "sum_rain"]);
    const rawStatus = apiStatusText(stringValue(row, ["status", "status_en", "state"]));
    const sourceStatus = staleStatus(rawStatus || "ปกติ", observed.iso);
    return {
      ...meta,
      name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name,
      kind: "RAIN" as const,
      observedAt: observed.iso,
      observedAtRaw: observed.raw,
      sourceStatus,
      rain5m: numberValue(row, ["rain_5", "rain5", "rain5m", "rf_5", "rf5"]),
      rain15m: numberValue(row, ["rain_15", "rain15", "rain15m", "rf_15", "rf15"]),
      rain30m: numberValue(row, ["rain_30", "rain30", "rain30m", "rf_30", "rf30"]),
      rain1h,
      rain3h: numberValue(row, ["rain_180", "rain180", "rain3h", "rf_180", "rf180"]),
      rain6h: null,
      rain12h: null,
      rain24h: numberValue(row, ["rain_1440", "rain24h", "rain24", "rf_1440"]),
      severity: rainfallSeverity(rain1h, sourceStatus),
    };
  });
}

async function fetchWaterApi(): Promise<WaterStation[]> {
  const statusUrl = `${API_BASE}/water/stationstatus_dt?period=5&datetime=${encodeURIComponent(nowQueryIso())}`;
  const [mainResult, statusResult] = await Promise.allSettled([
    fetchJson(`${API_BASE}/mainwater/lastdata/0`),
    fetchJson(statusUrl),
  ]);

  if (mainResult.status === "rejected" && statusResult.status === "rejected") {
    throw new Error(`mainwater: ${mainResult.reason instanceof Error ? mainResult.reason.message : "fetch failed"} | water status: ${statusResult.reason instanceof Error ? statusResult.reason.message : "fetch failed"}`);
  }

  const rows = [
    ...(statusResult.status === "fulfilled" ? asRows(statusResult.value) : []),
    ...(mainResult.status === "fulfilled" ? asRows(mainResult.value) : []),
  ];
  const indexed = indexApiRows(rows);

  return WATER_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row) return offlineWaterStation(meta, "ไม่พบสถานีใน BMA Flood API");

    const observed = apiObserved(row);
    const rawStatus = apiStatusText(stringValue(row, ["status", "status_en", "state"]));
    const sourceStatus = staleStatus(rawStatus || "ไม่ทราบสถานะ", observed.iso);
    return {
      ...meta,
      name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name,
      kind: "WATER" as const,
      observedAt: observed.iso,
      observedAtRaw: observed.raw,
      sourceStatus,
      levelInside: numberValue(row, ["wl_in", "level_in", "water_level_in", "value"]),
      levelOutside: numberValue(row, ["wl_out", "level_out", "water_level_out"]),
      riverLevel: numberValue(row, ["wl_m", "river_level", "water_level"]),
      severity: severityFromBmaStatus(sourceStatus),
    };
  });
}

async function fetchRoadApi(): Promise<RoadFloodStation[]> {
  const statusUrl = `${API_BASE}/flood/stationstatus_dt?period=5&datetime=${encodeURIComponent(nowQueryIso())}`;
  const [statusResult, eventResult] = await Promise.allSettled([
    fetchJson(statusUrl),
    fetchJson(`${API_BASE}/flood/currentevent`),
  ]);

  if (statusResult.status === "rejected" && eventResult.status === "rejected") {
    throw new Error(`flood status: ${statusResult.reason instanceof Error ? statusResult.reason.message : "fetch failed"} | current event: ${eventResult.reason instanceof Error ? eventResult.reason.message : "fetch failed"}`);
  }

  const statusRows = statusResult.status === "fulfilled" ? asRows(statusResult.value) : [];
  const eventRows = eventResult.status === "fulfilled" ? asRows(eventResult.value) : [];
  const indexed = indexApiRows([...eventRows, ...statusRows]);
  const noActiveEvents = eventResult.status === "fulfilled" && eventRows.length === 0;

  return ROAD_FLOOD_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row) {
      if (noActiveEvents || statusResult.status === "fulfilled") {
        return {
          ...meta,
          kind: "ROAD_FLOOD" as const,
          observedAt: null,
          observedAtRaw: "",
          sourceStatus: noActiveEvents ? "ไม่พบเหตุการณ์น้ำท่วมที่เปิดอยู่" : "ไม่พบเหตุการณ์ที่สถานีนี้",
          depthCm: null,
          severity: "NORMAL" as const,
        };
      }
      return offlineRoadStation(meta);
    }

    const observed = apiObserved(row);
    const rawStatus = apiStatusText(stringValue(row, ["status", "status_en", "state"]));
    const depthCm = numberValue(row, ["flood_depth", "depth_cm", "depth", "water_depth", "wl", "value"]);
    const inferredStatus = rawStatus || (depthCm == null ? "ไม่ทราบสถานะ" : depthCm > 10 ? "วิกฤต" : depthCm >= 5 ? "เตือนภัย" : "ปกติ");
    const sourceStatus = staleStatus(inferredStatus, observed.iso);
    return {
      ...meta,
      name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name,
      road: stringValue(row, ["road_name", "road", "location"]) || meta.road,
      kind: "ROAD_FLOOD" as const,
      observedAt: observed.iso,
      observedAtRaw: observed.raw,
      sourceStatus,
      depthCm,
      severity: severityFromBmaStatus(sourceStatus),
    };
  });
}

function missingCount<T extends { sourceStatus: string }>(stations: T[]) {
  return stations.filter((station) => /ไม่พบข้อมูล|ไม่พบสถานีใน/.test(station.sourceStatus)).length;
}

async function withLegacyFallback<T>(
  apiLoader: () => Promise<T>,
  legacyUrls: readonly string[],
  legacyParser: (html: string) => T,
  label: string,
): Promise<{ data: T }> {
  try {
    return { data: await apiLoader() };
  } catch (apiError) {
    try {
      const html = await fetchFirstHtml(legacyUrls);
      return { data: legacyParser(html) };
    } catch (legacyError) {
      const apiMessage = apiError instanceof Error ? apiError.message : "API fetch failed";
      const legacyMessage = legacyError instanceof Error ? legacyError.message : "legacy fetch failed";
      throw new Error(`${label} API: ${apiMessage} | legacy: ${legacyMessage}`);
    }
  }
}

export async function getBmaLiveSnapshot(): Promise<BmaLiveSnapshot> {
  const errors: string[] = [];
  const [rainResult, waterResult, roadResult] = await Promise.allSettled([
    withLegacyFallback(fetchRainApi, LEGACY.rain, parseRainLegacy, "BMA Rain"),
    withLegacyFallback(fetchWaterApi, LEGACY.water, parseWaterLegacy, "BMA Water"),
    withLegacyFallback(fetchRoadApi, LEGACY.roadFlood, parseRoadLegacy, "BMA Road Flood"),
  ]);

  let rain: RainStation[];
  let water: WaterStation[];
  let roadFlood: RoadFloodStation[];

  if (rainResult.status === "fulfilled") {
    rain = rainResult.value.data;
    const missing = missingCount(rain);
    if (missing) errors.push(`BMA Rain: ไม่พบ ${missing} สถานีเป้าหมาย`);
  } else {
    rain = RAIN_STATIONS.map((meta) => offlineRainStation(meta));
    errors.push(`BMA Rain: ${rainResult.reason instanceof Error ? rainResult.reason.message : "fetch failed"}`);
  }

  if (waterResult.status === "fulfilled") {
    water = waterResult.value.data;
    const missing = missingCount(water);
    if (missing) errors.push(`BMA Water: ไม่พบ ${missing} สถานีเป้าหมาย`);
  } else {
    water = WATER_STATIONS.map((meta) => offlineWaterStation(meta));
    errors.push(`BMA Water: ${waterResult.reason instanceof Error ? waterResult.reason.message : "fetch failed"}`);
  }

  if (roadResult.status === "fulfilled") {
    roadFlood = roadResult.value.data;
    const missing = missingCount(roadFlood);
    if (missing) errors.push(`BMA Road Flood: ไม่พบ ${missing} สถานีเป้าหมาย`);
  } else {
    roadFlood = ROAD_FLOOD_STATIONS.map((meta) => offlineRoadStation(meta));
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
