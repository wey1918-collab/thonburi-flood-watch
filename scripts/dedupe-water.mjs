import fs from "node:fs/promises";

const inputPath = process.argv[2] || "/tmp/bma-latest.json";
const THAIWATER_WATER_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";
const CENTER = { latitude: 13.765, longitude: 100.475 };
const MAX_DISTANCE_KM = 15;
const MAX_STATIONS = 6;
const STALE_MS = 3 * 60 * 60 * 1000;

// Dashboard นี้เน้นฝั่งธนบุรีเป็นหลัก จึงคัดเฉพาะเขตฝั่งตะวันตกของ
// แม่น้ำเจ้าพระยาและพื้นที่บางกรวยที่เชื่อมต่อกับเส้นทางเฝ้าระวังของเว็บ
const THONBURI_SIDE_DISTRICTS = new Set([
  "บางกอกน้อย",
  "บางกอกใหญ่",
  "ธนบุรี",
  "ตลิ่งชัน",
  "บางพลัด",
  "คลองสาน",
  "ภาษีเจริญ",
  "บางแค",
  "ทวีวัฒนา",
  "หนองแขม",
  "จอมทอง",
  "บางขุนเทียน",
  "บางบอน",
  "ราษฎร์บูรณะ",
  "ทุ่งครุ",
  "บางกรวย",
]);

function sourceKey(station) {
  const status = String(station?.sourceStatus || "");
  if (!status.includes("ThaiWater")) return `bma:${station?.code || station?.name || "unknown"}`;

  const lat = Number(station?.latitude);
  const lon = Number(station?.longitude);
  const coordKey = Number.isFinite(lat) && Number.isFinite(lon)
    ? `${lat.toFixed(5)},${lon.toFixed(5)}`
    : "no-coord";
  const nameKey = String(station?.name || "unknown").trim().toLowerCase();
  return `thaiwater:${nameKey}:${coordKey}`;
}

function asRows(payload) {
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === "object" && !Array.isArray(x));
  if (!payload || typeof payload !== "object") return [];
  if (payload.waterlevel_data && typeof payload.waterlevel_data === "object") {
    return asRows(payload.waterlevel_data.data);
  }
  for (const key of ["data", "result", "results", "items", "rows"]) {
    if (Array.isArray(payload[key])) return asRows(payload[key]);
  }
  return [];
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function thaiText(value) {
  if (!value || typeof value !== "object") return "";
  return text(value.th) || text(value.en);
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
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

function isStale(iso) {
  return !iso || Date.now() - new Date(iso).getTime() > STALE_MS;
}

function hydrologyStatus(row, stale) {
  if (stale) return { label: "ข้อมูลเก่า", severity: "OFFLINE" };
  const level = Number(row?.situation_level);
  const bankText = String(row?.diff_wl_bank_text || "");
  if (level === 5 || bankText.includes("ล้น")) return { label: "ล้นตลิ่ง", severity: "CRITICAL" };
  if (level === 4) return { label: "น้ำมาก", severity: "WATCH" };
  if (level === 3) return { label: "น้ำปกติ", severity: "NORMAL" };
  if (level === 2) return { label: "เฝ้าระวัง", severity: "WATCH" };
  return { label: "ปกติ", severity: "NORMAL" };
}

function stationIdentity(row) {
  const station = row?.station || {};
  const code = text(station.tele_station_oldcode) || text(station.id);
  const lat = numberValue(station.tele_station_lat);
  const lon = numberValue(station.tele_station_long);
  const name = thaiText(station.tele_station_name) || "ThaiWater water station";
  return code || `${name.toLowerCase()}:${lat?.toFixed(5) || "na"},${lon?.toFixed(5) || "na"}`;
}

function isThonburiSideDistrict(district) {
  if (!district) return false;
  return [...THONBURI_SIDE_DISTRICTS].some((name) => district.includes(name));
}

async function loadNearbyThaiWaterStations() {
  const response = await fetch(THAIWATER_WATER_URL, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "ThonburiFloodWatchRelay/1.3 (+https://thonburi-flood-watch.vercel.app)",
      Referer: "https://www.thaiwater.net/",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`ThaiWater HTTP ${response.status}`);

  const rows = asRows(await response.json());
  const seen = new Set();
  const candidates = [];

  for (const row of rows) {
    const station = row?.station || {};
    const geocode = row?.geocode || {};
    const provinceCode = text(geocode.province_code);
    const provinceName = thaiText(geocode.province_name);
    const district = thaiText(geocode.amphoe_name);

    // รับเฉพาะกรุงเทพฯ และนนทบุรี จากนั้นบังคับให้เป็นเขตฝั่งธน/บางกรวยเท่านั้น
    const supportedProvince = provinceCode === "10" || provinceCode === "12" || /กรุงเทพ|นนทบุรี/.test(provinceName);
    if (!supportedProvince || !isThonburiSideDistrict(district)) continue;

    const lat = numberValue(station.tele_station_lat);
    const lon = numberValue(station.tele_station_long);
    const msl = numberValue(row?.waterlevel_msl);
    if (lat == null || lon == null || msl == null) continue;

    const distance = distanceKm(CENTER.latitude, CENTER.longitude, lat, lon);
    if (distance > MAX_DISTANCE_KM) continue;

    const identity = stationIdentity(row);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const rawTime = text(row?.waterlevel_datetime);
    const observedAt = parseBangkokTime(rawTime);
    const stale = isStale(observedAt);
    const status = hydrologyStatus(row, stale);
    const sourceCode = text(station.tele_station_oldcode) || text(station.id);
    const sourceName = thaiText(station.tele_station_name) || "ThaiWater water station";

    candidates.push({
      code: sourceCode ? `TW.${sourceCode}` : `TW.${lat.toFixed(5)}.${lon.toFixed(5)}`,
      name: `${sourceName}${sourceCode ? ` (${sourceCode})` : ""}`,
      district,
      latitude: lat,
      longitude: lon,
      kind: "WATER",
      observedAt,
      observedAtRaw: rawTime,
      sourceStatus: `ThaiWater fallback • ฝั่งธน/บางกรวย • สถานีจริง ${distance.toFixed(1)} กม. • ${status.label} • ไม่ใช่เซนเซอร์ BMA เดิม`,
      levelInside: msl,
      levelOutside: null,
      riverLevel: msl,
      severity: status.severity,
      _distance: distance,
      _stale: stale,
    });
  }

  return candidates
    .sort((a, b) => Number(a._stale) - Number(b._stale) || a._distance - b._distance)
    .slice(0, MAX_STATIONS)
    .map(({ _distance, _stale, ...station }) => station);
}

const raw = await fs.readFile(inputPath, "utf8");
const snapshot = JSON.parse(raw);

if (!Array.isArray(snapshot.water)) {
  throw new Error("Relay snapshot does not contain a water array");
}

const fallbackActive = snapshot.water.some((station) => String(station?.sourceStatus || "").includes("ThaiWater fallback"));

if (fallbackActive) {
  try {
    const expanded = await loadNearbyThaiWaterStations();
    if (expanded.length >= 3) {
      snapshot.water = expanded;
      console.log(`ThaiWater fallback expanded to ${expanded.length} unique Thonburi-side stations.`);
    } else {
      console.warn(`ThaiWater Thonburi-side expansion found only ${expanded.length} stations; keeping existing fallback and deduplicating it.`);
    }
  } catch (error) {
    console.warn(`ThaiWater expansion failed: ${error instanceof Error ? error.message : error}`);
  }
}

const seen = new Set();
const unique = [];
let removed = 0;

for (const station of snapshot.water) {
  const key = sourceKey(station);
  if (seen.has(key)) {
    removed += 1;
    continue;
  }
  seen.add(key);
  unique.push(station);
}

snapshot.water = unique;

await fs.writeFile(inputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Water station normalization complete: kept=${unique.length}, removed=${removed}`);
