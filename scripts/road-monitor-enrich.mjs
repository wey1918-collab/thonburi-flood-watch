import fs from "node:fs/promises";

const THAIWATER_ROAD_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/flood_road";
const STALE_MS = 3 * 60 * 60 * 1000;
const filePath = process.argv[2] || "/tmp/bma-latest.json";

// Corridor reference points are used only to choose the closest public road-flood
// sensor when the supplier does not expose a sensor whose name matches the road.
const MONITORS = [
  {
    code: "MON.CHARAN",
    name: "ถนนจรัญสนิทวงศ์",
    road: "ถนนจรัญสนิทวงศ์",
    district: "บางกอกน้อย",
    latitude: 13.76287,
    longitude: 100.47294,
    aliases: ["จรัญสนิทวงศ์", "จรัญ"],
    maxKm: 4,
  },
  {
    code: "MON.BANGKRUI",
    name: "ถนนบางกรวย-ไทรน้อย",
    road: "ถนนบางกรวย-ไทรน้อย",
    district: "บางกรวย นนทบุรี",
    latitude: 13.80443,
    longitude: 100.49295,
    aliases: ["บางกรวย-ไทรน้อย", "บางกรวย ไทรน้อย", "บางกรวย"],
    maxKm: 6,
  },
  {
    code: "MON.RATCHAPHRUEK",
    name: "ถนนราชพฤกษ์",
    road: "ถนนราชพฤกษ์",
    district: "ตลิ่งชัน/บางกรวย",
    latitude: 13.7852,
    longitude: 100.4441,
    aliases: ["ราชพฤกษ์"],
    maxKm: 6,
  },
];

function asRows(payload) {
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["data", "result", "results", "items", "rows"]) {
    if (Array.isArray(payload[key])) return asRows(payload[key]);
  }
  return [];
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s._()\-–—/]+/g, "")
    .replace(/^ถนน/, "")
    .replace(/^ถ\.?/, "");
}

function rowText(row) {
  return [
    row?.station?.floodroad_name?.th,
    row?.station?.floodroad_name?.en,
    row?.road_name,
    row?.road,
    row?.location,
    row?.station_name,
  ].filter(Boolean).join(" ");
}

function parseBangkokTime(raw) {
  if (!raw) return null;
  const local = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    const [, y, m, d, hh, mm, ss = "00"] = local;
    const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = (deg) => deg * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function coordinates(row) {
  const lat = numberValue(row?.station?.floodroad_lat ?? row?.latitude ?? row?.lat);
  const lon = numberValue(row?.station?.floodroad_long ?? row?.longitude ?? row?.lon ?? row?.lng);
  return lat == null || lon == null ? null : { lat, lon };
}

function isStale(iso) {
  return !iso || Date.now() - new Date(iso).getTime() > STALE_MS;
}

function roadSeverity(depthCm, stale) {
  if (stale) return "OFFLINE";
  if (depthCm == null) return "UNKNOWN";
  if (depthCm >= 10) return "WARNING";
  if (depthCm >= 5) return "WATCH";
  return "NORMAL";
}

function nearest(target, rows, maxKm) {
  let best = null;
  let bestKm = Infinity;
  for (const row of rows) {
    const point = coordinates(row);
    if (!point) continue;
    const km = distanceKm(target.latitude, target.longitude, point.lat, point.lon);
    if (km < bestKm) {
      best = row;
      bestKm = km;
    }
  }
  return best && bestKm <= maxKm ? { row: best, km: bestKm } : null;
}

function chooseRow(target, rows) {
  const aliases = target.aliases.map(normalize);
  const matching = rows.filter((row) => {
    const text = normalize(rowText(row));
    return aliases.some((alias) => alias && text.includes(alias));
  });
  if (matching.length) {
    const nearestMatch = nearest(target, matching, 100);
    return nearestMatch ? { ...nearestMatch, exactRoad: true } : null;
  }
  const nearby = nearest(target, rows, target.maxKm);
  return nearby ? { ...nearby, exactRoad: false } : null;
}

function buildMonitor(target, rows) {
  const found = chooseRow(target, rows);
  if (!found) {
    return {
      ...target,
      aliases: undefined,
      maxKm: undefined,
      kind: "ROAD_FLOOD",
      observedAt: null,
      observedAtRaw: "",
      sourceStatus: "ThaiWater road monitor • ไม่พบเซนเซอร์ตรงถนนหรือใกล้เคียง",
      depthCm: null,
      severity: "OFFLINE",
    };
  }

  const { row, km, exactRoad } = found;
  const raw = String(row?.floodroad_datetime || row?.datetime || row?.date_time || "");
  const iso = parseBangkokTime(raw);
  const stale = isStale(iso);
  const depthCm = numberValue(row?.floodroad_value ?? row?.depth_cm ?? row?.depth ?? row?.value);
  const point = coordinates(row);
  const sourceName = String(row?.station?.floodroad_name?.th || row?.station_name || rowText(row) || target.name);
  const sourceCode = String(row?.station?.floodroad_oldcode || row?.station?.id || "");
  const mode = exactRoad ? "ตรงชื่อถนน" : `สถานีใกล้เคียง ${km.toFixed(1)} กม.`;

  return {
    code: target.code,
    name: target.name,
    road: target.road,
    district: target.district,
    latitude: point?.lat ?? target.latitude,
    longitude: point?.lon ?? target.longitude,
    kind: "ROAD_FLOOD",
    observedAt: iso,
    observedAtRaw: raw,
    sourceStatus: `ThaiWater road monitor • ${mode} • ${sourceName}${sourceCode ? ` (${sourceCode})` : ""}${stale ? " • ข้อมูลเก่า" : ""}`,
    depthCm,
    severity: roadSeverity(depthCm, stale),
  };
}

async function main() {
  const snapshot = JSON.parse(await fs.readFile(filePath, "utf8"));

  const response = await fetch(THAIWATER_ROAD_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ThonburiFloodWatchRoadMonitor/1.0 (+https://thonburi-flood-watch.vercel.app)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`ThaiWater road monitor HTTP ${response.status}`);

  const payload = await response.json();
  const rows = asRows(payload);
  const monitors = MONITORS.map((target) => buildMonitor(target, rows));
  const oldRoads = Array.isArray(snapshot.roadFlood)
    ? snapshot.roadFlood.filter((road) => !String(road?.code || "").startsWith("MON."))
    : [];
  snapshot.roadFlood = [...monitors, ...oldRoads];

  const otherErrors = Array.isArray(snapshot.errors)
    ? snapshot.errors.filter((item) => !String(item).startsWith("Road Flood:"))
    : [];
  const offlineRoads = snapshot.roadFlood.filter((road) => road.severity === "OFFLINE" || road.severity === "UNKNOWN").length;
  if (offlineRoads) otherErrors.push(`Road Flood: ${offlineRoads} จุดไม่มีข้อมูลสด`);
  snapshot.errors = otherErrors;
  snapshot.ok = snapshot.errors.length === 0;
  snapshot.sources = { ...(snapshot.sources || {}), roadFlood: THAIWATER_ROAD_URL };
  snapshot.generatedAt = new Date().toISOString();

  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Road monitors added: ${monitors.map((m) => `${m.code}=${m.depthCm ?? "n/a"}cm/${m.severity}`).join(" | ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
