import type { BmaLiveSnapshot, RainStation, RoadFloodStation, WaterStation } from "./types";

const RELAY_URL =
  "https://raw.githubusercontent.com/wey1918-collab/thonburi-flood-watch/bma-cache/data/bma-latest.json";

const FRESH_MS = 20 * 60 * 1000;
const HARD_STALE_MS = 3 * 60 * 60 * 1000;

function isSnapshot(value: unknown): value is BmaLiveSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<BmaLiveSnapshot>;
  return (
    typeof snapshot.generatedAt === "string" &&
    Array.isArray(snapshot.rain) &&
    Array.isArray(snapshot.water) &&
    Array.isArray(snapshot.roadFlood) &&
    Array.isArray(snapshot.errors) &&
    !!snapshot.sources &&
    typeof snapshot.sources === "object"
  );
}

function relayLabel(status: string, stale: boolean) {
  const suffix = stale ? " • GitHub relay • ข้อมูลแคชเก่า" : " • GitHub relay";
  return status.includes("GitHub relay") ? status : `${status || "ไม่ทราบสถานะ"}${suffix}`;
}

function markRain(stations: RainStation[], stale: boolean): RainStation[] {
  return stations.map((station) => ({
    ...station,
    sourceStatus: relayLabel(station.sourceStatus, stale),
    severity: stale ? "OFFLINE" : station.severity,
  }));
}

function normalizeThaiWaterWater(station: WaterStation) {
  if (!station.sourceStatus.includes("ThaiWater fallback")) return station;

  // ThaiWater water-level situation classes are hydrological bands, not the
  // BMA alert vocabulary: level 3 = normal, level 4 = high water, level 5 =
  // over-bank. The relay script originally rendered 3/4 as warning/critical.
  // Normalize those labels here so a nearby "high water" station is not shown
  // as a false emergency. Explicit over-bank remains CRITICAL.
  if (station.sourceStatus.includes("ล้นตลิ่ง")) return station;

  if (station.sourceStatus.includes("วิกฤต")) {
    return {
      ...station,
      sourceStatus: station.sourceStatus.replace("วิกฤต", "น้ำมาก"),
      severity: "WATCH" as const,
    };
  }

  if (station.sourceStatus.includes("เตือนภัย")) {
    return {
      ...station,
      sourceStatus: station.sourceStatus.replace("เตือนภัย", "น้ำปกติ"),
      severity: "NORMAL" as const,
    };
  }

  return station;
}

function markWater(stations: WaterStation[], stale: boolean): WaterStation[] {
  return stations.map((raw) => {
    const station = normalizeThaiWaterWater(raw);
    return {
      ...station,
      sourceStatus: relayLabel(station.sourceStatus, stale),
      severity: stale ? "OFFLINE" : station.severity,
    };
  });
}

function markRoad(stations: RoadFloodStation[], stale: boolean): RoadFloodStation[] {
  return stations.map((station) => ({
    ...station,
    sourceStatus: relayLabel(station.sourceStatus, stale),
    severity: stale ? "OFFLINE" : station.severity,
  }));
}

export async function getBmaRelaySnapshot(): Promise<BmaLiveSnapshot | null> {
  try {
    const response = await fetch(`${RELAY_URL}?t=${Date.now()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ThonburiFloodWatch/0.5",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (!isSnapshot(payload)) return null;

    const generatedMs = new Date(payload.generatedAt).getTime();
    if (!Number.isFinite(generatedMs)) return null;

    const ageMs = Math.max(0, Date.now() - generatedMs);
    const stale = ageMs > FRESH_MS;
    const hardStale = ageMs > HARD_STALE_MS;
    const ageMinutes = Math.round(ageMs / 60000);

    return {
      ...payload,
      ok: Boolean(payload.ok) && !stale,
      rain: markRain(payload.rain, stale),
      water: markWater(payload.water, stale),
      roadFlood: markRoad(payload.roadFlood, stale),
      errors: stale
        ? [
            ...payload.errors,
            `BMA relay cache เก่า ${ageMinutes} นาที${hardStale ? " • เกิน 3 ชั่วโมง" : ""}`,
          ]
        : payload.errors,
    };
  } catch {
    return null;
  }
}
