import fs from "node:fs/promises";

const BMA_BASE = "https://flood.bangkok.go.th/api";
const THAIWATER_BASE = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public";
const outputPath = process.argv[2] || "bma-latest.json";
const STALE_MS = 3 * 60 * 60 * 1000;

const RAIN_STATIONS = [
  { code: "RF.BKN.01", name: "สนข.บางกอกน้อย", district: "บางกอกน้อย", latitude: 13.77078, longitude: 100.46806 },
  { code: "RF.BKN.02", name: "ส.คลองมอญ", district: "บางกอกน้อย", latitude: 13.74714, longitude: 100.48531 },
  { code: "RF.TBR.01", name: "สนข.ธนบุรี", district: "ธนบุรี", latitude: 13.72497, longitude: 100.48558 },
  { code: "RF.TBR.02", name: "ส.คลองสำเหร่", district: "ธนบุรี", latitude: 13.70670, longitude: 100.49646 },
  { code: "RF.BKY.01", name: "สนข.บางกอกใหญ่", district: "บางกอกใหญ่", latitude: 13.72332, longitude: 100.47622 },
  { code: "RF.BKY.02", name: "ส.คลองบางกอกใหญ่", district: "บางกอกใหญ่", latitude: 13.74022, longitude: 100.49012 },
];

const WATER_STATIONS = [
  { code: "WL.KMN.01", name: "ส.คลองมอญ", district: "บางกอกน้อย", latitude: 13.74703, longitude: 100.48489 },
  { code: "WL.BBR.01", name: "ค.บางบำหรุ ถ.บรมราชชนนี", district: "บางกอกน้อย", latitude: 13.77927, longitude: 100.47591 },
  { code: "WL.BKY.01", name: "ส.คลองบางกอกใหญ่", district: "ธนบุรี", latitude: 13.74020, longitude: 100.48992 },
  { code: "WL.SRE.01", name: "ส.คลองสำเหร่", district: "ธนบุรี", latitude: 13.70671, longitude: 100.49647 },
];

const ROAD_STATIONS = [
  { code: "FL.BKN.01", name: "ถ.อิสรภาพ (ตลาดพรานนก)", road: "ถนนอิสรภาพ", district: "บางกอกน้อย", latitude: 13.75470, longitude: 100.47810 },
  { code: "FL.BKN.02", name: "ถ.บรมราชชนนี (สายใต้)", road: "ถนนบรมราชชนนี", district: "บางกอกน้อย", latitude: 13.78705, longitude: 100.46802 },
];

function asRows(payload) {
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === "object" && !Array.isArray(x));
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["data", "result", "results", "items", "rows"]) {
    if (Array.isArray(payload[key])) return asRows(payload[key]);
  }
  return [];
}

function stringValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function parseBangkokTime(raw) {
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

function isStale(iso) {
  return !iso || Date.now() - new Date(iso).getTime() > STALE_MS;
}

function apiStatusText(status) {
  const value = (status || "").trim().toLowerCase();
  if (value === "normal") return "ปกติ";
  if (value === "warning") return "เตือนภัย";
  if (value === "critical") return "วิกฤต";
  return status || "ไม่ทราบสถานะ";
}

function severityFromStatus(status) {
  const value = (status || "").toLowerCase();
  if (/ขัดข้อง|offline|ข้อมูลเก่า/.test(value)) return "OFFLINE";
  if (/critical|วิกฤต|น้ำท่วม$|ล้นตลิ่ง/.test(value)) return "CRITICAL";
  if (/warning|เตือนภัย/.test(value)) return "WARNING";
  if (/watch|เฝ้าระวัง|น้ำท่วมขังเล็กน้อย/.test(value)) return "WATCH";
  if (/normal|ปกติ/.test(value)) return "NORMAL";
  return "UNKNOWN";
}

function rainfallSeverity(mm, stale = false) {
  if (stale) return "OFFLINE";
  if (mm == null) return "UNKNOWN";
  if (mm > 90) return "CRITICAL";
  if (mm > 35) return "WARNING";
  if (mm > 10) return "WATCH";
  return "NORMAL";
}

function waterSeverity(row, stale = false) {
  if (stale) return "OFFLINE";
  const level = Number(row?.situation_level);
  const bankText = String(row?.diff_wl_bank_text || "");
  if (level === 5 || bankText.includes("ล้น")) return "CRITICAL";
  if (level === 4) return "CRITICAL";
  if (level === 3) return "WARNING";
  if (level === 2) return "WATCH";
  return "NORMAL";
}

function waterStatus(row, stale = false) {
  if (stale) return "ข้อมูลเก่า";
  const severity = waterSeverity(row, false);
  if (severity === "CRITICAL") return String(row?.diff_wl_bank_text || "").includes("ล้น") ? "ล้นตลิ่ง" : "วิกฤต";
  if (severity === "WARNING") return "เตือนภัย";
  if (severity === "WATCH") return "เฝ้าระวัง";
  return "ปกติ";
}

function roadSeverity(depth, stale = false) {
  if (stale) return "OFFLINE";
  if (depth == null) return "UNKNOWN";
  if (depth > 10) return "CRITICAL";
  if (depth >= 5) return "WARNING";
  return "NORMAL";
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = (d) => d * Math.PI / 180;
  const R = 6371;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function nearest(target, rows, coord, maxKm) {
  let best = null;
  let bestKm = Infinity;
  for (const row of rows) {
    const point = coord(row);
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    const km = distanceKm(target.latitude, target.longitude, point.lat, point.lon);
    if (km < bestKm) {
      best = row;
      bestKm = km;
    }
  }
  return best && bestKm <= maxKm ? { row: best, km: bestKm } : null;
}

async function fetchJson(label, url, referer) {
  const controller = AbortSignal.timeout(12000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ThonburiFloodWatchRelay/1.1 (+https://thonburi-flood-watch.vercel.app)",
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "th-TH,th;q=0.9,en;q=0.7",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: controller,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : "fetch failed"}`);
  }
}

async function optional(label, url, referer) {
  try {
    return { ok: true, value: await fetchJson(label, url, referer), error: null };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return { ok: false, value: null, error: error instanceof Error ? error.message : "fetch failed" };
  }
}

function bmaRows(payload) {
  return asRows(payload);
}

function indexBma(rows) {
  const map = new Map();
  for (const row of rows) {
    const code = stringValue(row, ["st_code", "station_code", "stationCode", "code", "station"]);
    if (code) map.set(code, row);
  }
  return map;
}

function bmaObserved(row) {
  const raw = stringValue(row, ["site_time", "datetime", "date_time", "observed_at", "observedAt", "time"]);
  return { raw, iso: parseBangkokTime(raw) };
}

function buildBmaRain(payload, queryTime) {
  const indexed = indexBma(bmaRows(payload));
  return RAIN_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row) return { ...meta, kind: "RAIN", observedAt: queryTime, observedAtRaw: "ช่วง 60 นาทีล่าสุด", sourceStatus: "ปกติ • ไม่พบฝนในช่วง 60 นาทีล่าสุด", rain5m: null, rain15m: null, rain30m: null, rain1h: 0, rain3h: null, rain6h: null, rain12h: null, rain24h: null, severity: "NORMAL" };
    const obs = bmaObserved(row);
    const rain1h = numberValue(row, ["rain_60", "rain60", "rain60m", "rain_1h", "rain1h", "rf_60", "rf60", "rainfall", "rain", "rf", "value", "sum_rain"]);
    const status = apiStatusText(stringValue(row, ["status", "status_en", "state"])) || "ปกติ";
    return { ...meta, name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name, kind: "RAIN", observedAt: obs.iso, observedAtRaw: obs.raw, sourceStatus: status, rain5m: numberValue(row, ["rain_5", "rain5", "rain5m", "rf_5", "rf5"]), rain15m: numberValue(row, ["rain_15", "rain15", "rain15m", "rf_15", "rf15"]), rain30m: numberValue(row, ["rain_30", "rain30", "rain30m", "rf_30", "rf30"]), rain1h, rain3h: numberValue(row, ["rain_180", "rain180", "rain3h", "rf_180", "rf180"]), rain6h: null, rain12h: null, rain24h: numberValue(row, ["rain_1440", "rain24h", "rain24", "rf_1440"]), severity: rainfallSeverity(rain1h, isStale(obs.iso)) };
  });
}

function buildBmaWater(mainPayload, statusPayload) {
  const indexed = indexBma([...bmaRows(statusPayload), ...bmaRows(mainPayload)]);
  return WATER_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row) return null;
    const obs = bmaObserved(row);
    const status = isStale(obs.iso) ? "ข้อมูลเก่า" : apiStatusText(stringValue(row, ["status", "status_en", "state"]));
    return { ...meta, name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name, kind: "WATER", observedAt: obs.iso, observedAtRaw: obs.raw, sourceStatus: status || "ไม่ทราบสถานะ", levelInside: numberValue(row, ["wl_in", "level_in", "water_level_in", "value"]), levelOutside: numberValue(row, ["wl_out", "level_out", "water_level_out"]), riverLevel: numberValue(row, ["wl_m", "river_level", "water_level"]), severity: isStale(obs.iso) ? "OFFLINE" : severityFromStatus(status) };
  }).filter(Boolean);
}

function buildBmaRoad(statusPayload, eventPayload) {
  const statusRows = bmaRows(statusPayload);
  const eventRows = bmaRows(eventPayload);
  const indexed = indexBma([...eventRows, ...statusRows]);
  const noActiveEvents = eventRows.length === 0;
  return ROAD_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row && (noActiveEvents || statusRows.length >= 0)) return { ...meta, kind: "ROAD_FLOOD", observedAt: null, observedAtRaw: "", sourceStatus: noActiveEvents ? "ไม่พบเหตุการณ์น้ำท่วมที่เปิดอยู่" : "ไม่พบเหตุการณ์ที่สถานีนี้", depthCm: null, severity: "NORMAL" };
    if (!row) return null;
    const obs = bmaObserved(row);
    const depthCm = numberValue(row, ["flood_depth", "depth_cm", "depth", "water_depth", "wl", "value"]);
    const status = isStale(obs.iso) ? "ข้อมูลเก่า" : apiStatusText(stringValue(row, ["status", "status_en", "state"]));
    return { ...meta, name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name, road: stringValue(row, ["road_name", "road", "location"]) || meta.road, kind: "ROAD_FLOOD", observedAt: obs.iso, observedAtRaw: obs.raw, sourceStatus: status || "ปกติ", depthCm, severity: isStale(obs.iso) ? "OFFLINE" : roadSeverity(depthCm) };
  }).filter(Boolean);
}

function thaiRainRows(payload) {
  return asRows(payload?.data ?? payload);
}

function thaiWaterRows(payload) {
  return asRows(payload?.waterlevel_data?.data ?? payload);
}

function thaiRoadRows(payload) {
  return asRows(payload?.data ?? payload);
}

function bangkokOnly(rows) {
  return rows.filter((row) => String(row?.geocode?.province_code || "") === "10" || /กรุงเทพ/.test(String(row?.geocode?.province_name?.th || "")));
}

function buildThaiWaterRain(payload) {
  const rows = bangkokOnly(thaiRainRows(payload)).filter((row) => numberValue(row, ["rain_1h"]) != null && row?.station);
  return RAIN_STATIONS.map((meta) => {
    const found = nearest(meta, rows, (row) => ({ lat: Number(row.station?.tele_station_lat), lon: Number(row.station?.tele_station_long) }), 8);
    if (!found) return { ...meta, kind: "RAIN", observedAt: null, observedAtRaw: "", sourceStatus: "ThaiWater fallback • ไม่พบสถานีใกล้เคียง", rain5m: null, rain15m: null, rain30m: null, rain1h: null, rain3h: null, rain6h: null, rain12h: null, rain24h: null, severity: "OFFLINE" };
    const { row, km } = found;
    const raw = String(row.rainfall_datetime || "");
    const iso = parseBangkokTime(raw);
    const stale = isStale(iso);
    const rain1h = numberValue(row, ["rain_1h"]);
    const sourceName = String(row.station?.tele_station_name?.th || row.station?.tele_station_name?.en || meta.name);
    const sourceCode = String(row.station?.tele_station_oldcode || row.station?.id || "");
    return { ...meta, name: `${sourceName}${sourceCode ? ` (${sourceCode})` : ""}`, latitude: Number(row.station.tele_station_lat), longitude: Number(row.station.tele_station_long), kind: "RAIN", observedAt: iso, observedAtRaw: raw, sourceStatus: `ThaiWater fallback • สถานีใกล้เคียง ${km.toFixed(1)} กม.${stale ? " • ข้อมูลเก่า" : ""}`, rain5m: null, rain15m: null, rain30m: null, rain1h, rain3h: null, rain6h: null, rain12h: null, rain24h: numberValue(row, ["rain_24h"]), severity: rainfallSeverity(rain1h, stale) };
  });
}

function buildThaiWaterWater(payload) {
  const rows = bangkokOnly(thaiWaterRows(payload)).filter((row) => numberValue(row, ["waterlevel_msl"]) != null && row?.station);
  return WATER_STATIONS.map((meta) => {
    const found = nearest(meta, rows, (row) => ({ lat: Number(row.station?.tele_station_lat), lon: Number(row.station?.tele_station_long) }), 10);
    if (!found) return { ...meta, kind: "WATER", observedAt: null, observedAtRaw: "", sourceStatus: "ThaiWater fallback • ไม่พบสถานีใกล้เคียง", levelInside: null, levelOutside: null, riverLevel: null, severity: "OFFLINE" };
    const { row, km } = found;
    const raw = String(row.waterlevel_datetime || "");
    const iso = parseBangkokTime(raw);
    const stale = isStale(iso);
    const msl = numberValue(row, ["waterlevel_msl"]);
    const sourceName = String(row.station?.tele_station_name?.th || row.station?.tele_station_name?.en || meta.name);
    const sourceCode = String(row.station?.tele_station_oldcode || row.station?.id || "");
    const status = waterStatus(row, stale);
    return { ...meta, name: `${sourceName}${sourceCode ? ` (${sourceCode})` : ""}`, latitude: Number(row.station.tele_station_lat), longitude: Number(row.station.tele_station_long), kind: "WATER", observedAt: iso, observedAtRaw: raw, sourceStatus: `ThaiWater fallback • สถานีใกล้เคียง ${km.toFixed(1)} กม. • ${status} • ไม่ใช่เซนเซอร์ BMA เดิม`, levelInside: msl, levelOutside: null, riverLevel: msl, severity: waterSeverity(row, stale) };
  });
}

function buildThaiWaterRoad(payload) {
  const rows = bangkokOnly(thaiRoadRows(payload)).filter((row) => row?.station);
  return ROAD_STATIONS.map((meta) => {
    const exact = rows.find((row) => String(row.station?.floodroad_oldcode || "") === meta.code);
    const found = exact ? { row: exact, km: distanceKm(meta.latitude, meta.longitude, Number(exact.station.floodroad_lat), Number(exact.station.floodroad_long)) } : nearest(meta, rows, (row) => ({ lat: Number(row.station?.floodroad_lat), lon: Number(row.station?.floodroad_long) }), 4);
    if (!found) return { ...meta, kind: "ROAD_FLOOD", observedAt: null, observedAtRaw: "", sourceStatus: "ThaiWater relay • ไม่พบเซนเซอร์ใกล้เคียง", depthCm: null, severity: "OFFLINE" };
    const { row, km } = found;
    const raw = String(row.floodroad_datetime || "");
    const iso = parseBangkokTime(raw);
    const stale = isStale(iso);
    const depthCm = numberValue(row, ["floodroad_value"]);
    const sourceCode = String(row.station?.floodroad_oldcode || meta.code);
    const sourceName = String(row.station?.floodroad_name?.th || meta.name);
    return { code: sourceCode, name: sourceName, road: sourceName, district: String(row.geocode?.amphoe_name?.th || meta.district), latitude: Number(row.station.floodroad_lat), longitude: Number(row.station.floodroad_long), kind: "ROAD_FLOOD", observedAt: iso, observedAtRaw: raw, sourceStatus: `ThaiWater relay • ${exact ? "รหัสตรงกัน" : `สถานีใกล้เคียง ${km.toFixed(1)} กม.`}${stale ? " • ข้อมูลเก่า" : ""}`, depthCm, severity: roadSeverity(depthCm, stale) };
  });
}

function hasUseful(stations) {
  return stations.length > 0 && stations.some((station) => station.severity !== "OFFLINE" && station.severity !== "UNKNOWN");
}

async function main() {
  const queryTime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const rainUrl = `${BMA_BASE}/rain/stationstatus_dt?period=60&datetime=${encodeURIComponent(queryTime)}`;
  const waterStatusUrl = `${BMA_BASE}/water/stationstatus_dt?period=5&datetime=${encodeURIComponent(queryTime)}`;
  const floodStatusUrl = `${BMA_BASE}/flood/stationstatus_dt?period=5&datetime=${encodeURIComponent(queryTime)}`;

  const [bmaRain, bmaMainWater, bmaWaterStatus, bmaFloodStatus, bmaFloodEvent, twRain, twWater, twRoad] = await Promise.all([
    optional("BMA rain", rainUrl, "https://flood.bangkok.go.th/"),
    optional("BMA mainwater", `${BMA_BASE}/mainwater/lastdata/0`, "https://flood.bangkok.go.th/"),
    optional("BMA water status", waterStatusUrl, "https://flood.bangkok.go.th/"),
    optional("BMA flood status", floodStatusUrl, "https://flood.bangkok.go.th/"),
    optional("BMA flood current event", `${BMA_BASE}/flood/currentevent`, "https://flood.bangkok.go.th/"),
    optional("ThaiWater rain", `${THAIWATER_BASE}/rain_24h?province_code=10`, "https://www.thaiwater.net/"),
    optional("ThaiWater water", `${THAIWATER_BASE}/waterlevel_load`, "https://www.thaiwater.net/"),
    optional("ThaiWater road", `${THAIWATER_BASE}/flood_road`, "https://www.thaiwater.net/"),
  ]);

  let rain;
  let water;
  let roadFlood;
  let rainSource;
  let waterSource;
  let roadSource;

  if (bmaRain.ok) {
    rain = buildBmaRain(bmaRain.value, new Date().toISOString());
    rainSource = rainUrl;
  } else if (twRain.ok) {
    rain = buildThaiWaterRain(twRain.value);
    rainSource = `${THAIWATER_BASE}/rain_24h?province_code=10`;
  } else {
    throw new Error(`Rain unavailable: ${bmaRain.error} | ${twRain.error}`);
  }

  const directWater = bmaMainWater.ok || bmaWaterStatus.ok ? buildBmaWater(bmaMainWater.value, bmaWaterStatus.value) : [];
  if (hasUseful(directWater)) {
    const byCode = new Map(directWater.map((s) => [s.code, s]));
    water = WATER_STATIONS.map((meta) => byCode.get(meta.code) || { ...meta, kind: "WATER", observedAt: null, observedAtRaw: "", sourceStatus: "ไม่พบสถานีใน BMA Flood API", levelInside: null, levelOutside: null, riverLevel: null, severity: "OFFLINE" });
    waterSource = `${BMA_BASE}/mainwater/lastdata/0`;
  } else if (twWater.ok) {
    water = buildThaiWaterWater(twWater.value);
    waterSource = `${THAIWATER_BASE}/waterlevel_load`;
  } else {
    throw new Error(`Water unavailable: ${bmaMainWater.error} | ${bmaWaterStatus.error} | ${twWater.error}`);
  }

  if (bmaFloodStatus.ok || bmaFloodEvent.ok) {
    roadFlood = buildBmaRoad(bmaFloodStatus.value, bmaFloodEvent.value);
    roadSource = floodStatusUrl;
  } else if (twRoad.ok) {
    roadFlood = buildThaiWaterRoad(twRoad.value);
    roadSource = `${THAIWATER_BASE}/flood_road`;
  } else {
    throw new Error(`Road flood unavailable: ${bmaFloodStatus.error} | ${bmaFloodEvent.error} | ${twRoad.error}`);
  }

  const errors = [];
  const offlineRain = rain.filter((s) => s.severity === "OFFLINE").length;
  const offlineWater = water.filter((s) => s.severity === "OFFLINE").length;
  const offlineRoad = roadFlood.filter((s) => s.severity === "OFFLINE").length;
  if (offlineRain) errors.push(`Rain: ${offlineRain} จุดไม่มีข้อมูลสด`);
  if (offlineWater) errors.push(`Water: ${offlineWater} จุดไม่มีข้อมูลสด`);
  if (offlineRoad) errors.push(`Road Flood: ${offlineRoad} จุดไม่มีข้อมูลสด`);

  const snapshot = {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    rain,
    water,
    roadFlood,
    errors,
    sources: { rain: rainSource, water: waterSource, roadFlood: roadSource },
  };

  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
  console.log(`Sources: rain=${rainSource} water=${waterSource} road=${roadSource}`);
  console.log(`Snapshot ok=${snapshot.ok}; errors=${errors.join(" | ") || "none"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
