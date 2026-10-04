import type { BmaLiveSnapshot, Severity } from "@/lib/bma/types";
import type {
  ThaiWaterLevelContext,
  ThaiWaterRainContext,
  ThaiWaterRoadContext,
  ThaiWaterSnapshot,
} from "./types";

const BASE = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public";
const RAIN_URL = `${BASE}/rain_24h?province_code=10`;
const WATER_URL = `${BASE}/waterlevel_load`;
const ROAD_URL = `${BASE}/flood_road`;
const CENTER = { latitude: 13.765, longitude: 100.475 };
const STALE_MS = 3 * 60 * 60 * 1000;
const ROAD_CODES = new Set(["FL.BKN.01", "FL.BKN.02"]);

type Row = Record<string, unknown>;

function asRows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload.filter((x): x is Row => Boolean(x) && typeof x === "object" && !Array.isArray(x));
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["data", "result", "results", "items", "rows"]) {
    if (Array.isArray(obj[key])) return asRows(obj[key]);
  }
  const water = obj.waterlevel_data;
  if (water && typeof water === "object") return asRows((water as Record<string, unknown>).data);
  return [];
}

function obj(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function thaiText(value: unknown) {
  const record = obj(value);
  return text(record.th) || text(record.en);
}

function parseBangkokTime(raw: string): string | null {
  if (!raw) return null;
  const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    const [, y, m, d, hh, mm, ss = "00"] = local;
    const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isStale(iso: string | null) {
  return !iso || Date.now() - new Date(iso).getTime() > STALE_MS;
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

function rainSeverity(mm: number | null, stale: boolean): Severity {
  if (stale) return "OFFLINE";
  if (mm == null) return "UNKNOWN";
  if (mm > 90) return "CRITICAL";
  if (mm > 35) return "WARNING";
  if (mm > 10) return "WATCH";
  return "NORMAL";
}

function waterSeverity(level: number | null, bankText: string, stale: boolean): Severity {
  if (stale) return "OFFLINE";
  if (bankText.includes("ล้น") || level === 5) return "CRITICAL";
  if (level === 4) return "CRITICAL";
  if (level === 3) return "WARNING";
  if (level === 2) return "WATCH";
  if (level === 1) return "NORMAL";
  return "UNKNOWN";
}

function roadSeverity(depth: number | null, stale: boolean): Severity {
  if (stale) return "OFFLINE";
  if (depth == null) return "UNKNOWN";
  if (depth > 10) return "CRITICAL";
  if (depth >= 5) return "WARNING";
  return "NORMAL";
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ThonburiFloodWatch/0.6 (+https://thonburi-flood-watch.vercel.app)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function parseRain(payload: unknown): ThaiWaterRainContext | null {
  const candidates = asRows(payload).map((row) => {
    const station = obj(row.station);
    const geocode = obj(row.geocode);
    const provinceCode = text(geocode.province_code);
    const lat = num(station.tele_station_lat);
    const lon = num(station.tele_station_long);
    if (provinceCode && provinceCode !== "10") return null;
    if (lat == null || lon == null) return null;
    const raw = text(row.rainfall_datetime);
    const iso = parseBangkokTime(raw);
    const stale = isStale(iso);
    const rain1h = num(row.rain_1h);
    const rain24h = num(row.rain_24h);
    return {
      stationName: thaiText(station.tele_station_name) || text(station.tele_station_oldcode) || "ThaiWater station",
      latitude: lat,
      longitude: lon,
      distanceKm: distanceKm(CENTER.latitude, CENTER.longitude, lat, lon),
      observedAt: iso,
      observedAtRaw: raw,
      rain1h,
      rain24h,
      agency: thaiText(obj(row.agency).agency_shortname) || null,
      stale,
      severity: rainSeverity(rain1h, stale),
    } satisfies ThaiWaterRainContext;
  }).filter((x): x is ThaiWaterRainContext => Boolean(x));

  const fresh = candidates.filter((x) => !x.stale && x.distanceKm <= 15);
  const pool = fresh.length ? fresh : candidates.filter((x) => x.distanceKm <= 15);
  return pool.sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
}

function parseWater(payload: unknown): ThaiWaterLevelContext[] {
  return asRows(payload).map((row) => {
    const station = obj(row.station);
    const geocode = obj(row.geocode);
    const provinceCode = text(geocode.province_code);
    const lat = num(station.tele_station_lat);
    const lon = num(station.tele_station_long);
    if (provinceCode && provinceCode !== "10") return null;
    if (lat == null || lon == null) return null;
    const distance = distanceKm(CENTER.latitude, CENTER.longitude, lat, lon);
    if (distance > 15) return null;
    const raw = text(row.waterlevel_datetime);
    const iso = parseBangkokTime(raw);
    const stale = isStale(iso);
    const situation = num(row.situation_level);
    const bankText = text(row.diff_wl_bank_text);
    return {
      stationName: thaiText(station.tele_station_name) || "ThaiWater water station",
      stationCode: text(station.tele_station_oldcode) || String(num(station.id) ?? ""),
      latitude: lat,
      longitude: lon,
      distanceKm: distance,
      observedAt: iso,
      observedAtRaw: raw,
      levelMslM: num(row.waterlevel_msl),
      situationLevel: situation,
      bankText,
      diffBankM: num(row.diff_wl_bank),
      agency: thaiText(obj(row.agency).agency_shortname) || null,
      stale,
      severity: waterSeverity(situation, bankText, stale),
    } satisfies ThaiWaterLevelContext;
  }).filter((x): x is ThaiWaterLevelContext => Boolean(x))
    .sort((a, b) => Number(a.stale) - Number(b.stale) || a.distanceKm - b.distanceKm)
    .slice(0, 3);
}

function parseRoad(payload: unknown): ThaiWaterRoadContext[] {
  return asRows(payload).map((row) => {
    const station = obj(row.station);
    const code = text(station.floodroad_oldcode);
    if (!ROAD_CODES.has(code)) return null;
    const raw = text(row.floodroad_datetime);
    const iso = parseBangkokTime(raw);
    const stale = isStale(iso);
    const depth = num(row.floodroad_value);
    return {
      code,
      name: thaiText(station.floodroad_name) || code,
      latitude: num(station.floodroad_lat) ?? 0,
      longitude: num(station.floodroad_long) ?? 0,
      observedAt: iso,
      observedAtRaw: raw,
      depthCm: depth,
      stale,
      severity: roadSeverity(depth, stale),
    } satisfies ThaiWaterRoadContext;
  }).filter((x): x is ThaiWaterRoadContext => Boolean(x));
}

export async function getThaiWaterBangkokContext(): Promise<ThaiWaterSnapshot> {
  const errors: string[] = [];
  const [rainResult, waterResult, roadResult] = await Promise.allSettled([
    fetchJson(RAIN_URL),
    fetchJson(WATER_URL),
    fetchJson(ROAD_URL),
  ]);

  const rain = rainResult.status === "fulfilled" ? parseRain(rainResult.value) : null;
  const water = waterResult.status === "fulfilled" ? parseWater(waterResult.value) : [];
  const roadFlood = roadResult.status === "fulfilled" ? parseRoad(roadResult.value) : [];

  if (rainResult.status === "rejected") errors.push(`ฝน: ${rainResult.reason instanceof Error ? rainResult.reason.message : "fetch failed"}`);
  if (waterResult.status === "rejected") errors.push(`ระดับน้ำ: ${waterResult.reason instanceof Error ? waterResult.reason.message : "fetch failed"}`);
  if (roadResult.status === "rejected") errors.push(`ถนน: ${roadResult.reason instanceof Error ? roadResult.reason.message : "fetch failed"}`);
  if (!rain && rainResult.status === "fulfilled") errors.push("ฝน: ไม่พบสถานีใกล้พื้นที่");
  if (!water.length && waterResult.status === "fulfilled") errors.push("ระดับน้ำ: ไม่พบสถานีใกล้พื้นที่");

  return {
    ok: Boolean(rain || water.length || roadFlood.length),
    generatedAt: new Date().toISOString(),
    via: "direct",
    rain,
    water,
    roadFlood,
    errors,
    sources: { rain: RAIN_URL, water: WATER_URL, roadFlood: ROAD_URL },
  };
}

export function getThaiWaterFromRelay(snapshot: BmaLiveSnapshot): ThaiWaterSnapshot | null {
  const fallbackRain = snapshot.rain.find((s) => /ThaiWater/.test(s.sourceStatus));
  const fallbackWater = snapshot.water.filter((s) => /ThaiWater/.test(s.sourceStatus));
  const fallbackRoad = snapshot.roadFlood.filter((s) => /ThaiWater/.test(s.sourceStatus));
  if (!fallbackRain && !fallbackWater.length && !fallbackRoad.length) return null;

  const rain: ThaiWaterRainContext | null = fallbackRain ? {
    stationName: fallbackRain.name,
    latitude: fallbackRain.latitude,
    longitude: fallbackRain.longitude,
    distanceKm: Number(fallbackRain.sourceStatus.match(/([\d.]+)\s*กม/)?.[1] ?? 0),
    observedAt: fallbackRain.observedAt,
    observedAtRaw: fallbackRain.observedAtRaw,
    rain1h: fallbackRain.rain1h,
    rain24h: fallbackRain.rain24h,
    agency: "ThaiWater/สสน.",
    stale: fallbackRain.severity === "OFFLINE",
    severity: fallbackRain.severity,
  } : null;

  const water: ThaiWaterLevelContext[] = fallbackWater.slice(0, 3).map((s) => ({
    stationName: s.name,
    stationCode: s.code,
    latitude: s.latitude,
    longitude: s.longitude,
    distanceKm: Number(s.sourceStatus.match(/([\d.]+)\s*กม/)?.[1] ?? 0),
    observedAt: s.observedAt,
    observedAtRaw: s.observedAtRaw,
    levelMslM: s.riverLevel ?? s.levelInside,
    situationLevel: null,
    bankText: s.sourceStatus,
    diffBankM: null,
    agency: "ThaiWater/สสน.",
    stale: s.severity === "OFFLINE",
    severity: s.severity,
  }));

  const roadFlood: ThaiWaterRoadContext[] = fallbackRoad.map((s) => ({
    code: s.code,
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    observedAt: s.observedAt,
    observedAtRaw: s.observedAtRaw,
    depthCm: s.depthCm,
    stale: s.severity === "OFFLINE",
    severity: s.severity,
  }));

  return {
    ok: Boolean(rain || water.length || roadFlood.length),
    generatedAt: snapshot.generatedAt,
    via: "github-relay",
    rain,
    water,
    roadFlood,
    errors: snapshot.errors,
    sources: snapshot.sources,
  };
}
