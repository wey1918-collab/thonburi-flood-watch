import fs from "node:fs/promises";

const API_BASE = "https://flood.bangkok.go.th/api";
const outputPath = process.argv[2] || "bma-latest.json";

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
  { code: "WL.BKY.01", name: "ส.คลองบางกอกใหญ่", district: "ธนบุรี", latitude: 13.7402, longitude: 100.48992 },
  { code: "WL.SRE.01", name: "ส.คลองสำเหร่", district: "ธนบุรี", latitude: 13.70671, longitude: 100.49647 },
];

const ROAD_STATIONS = [
  { code: "FL.BKN.01", name: "ถ.อิสรภาพ (ตลาดพรานนก)", road: "ถนนอิสรภาพ", district: "บางกอกน้อย", latitude: 13.7547, longitude: 100.4781 },
  { code: "FL.BKN.02", name: "ถ.บรมราชชนนี (สายใต้)", road: "ถนนบรมราชชนนี", district: "บางกอกน้อย", latitude: 13.78705, longitude: 100.46802 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function asRows(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }
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
      const n = Number(value.replace(/,/g, "").trim());
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function stationCode(row) {
  return stringValue(row, ["st_code", "station_code", "stationCode", "code", "station"]);
}

function indexRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const code = stationCode(row);
    if (code) map.set(code, row);
  }
  return map;
}

function parseDateTime(raw) {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function observed(row) {
  const raw = stringValue(row, ["site_time", "datetime", "date_time", "observed_at", "observedAt", "time"]);
  return { raw, iso: parseDateTime(raw) };
}

function apiStatusText(status) {
  const normalized = (status || "").trim().toLowerCase();
  if (normalized === "normal") return "ปกติ";
  if (normalized === "warning") return "เตือนภัย";
  if (normalized === "critical") return "วิกฤต";
  return status || "ไม่ทราบสถานะ";
}

function severityFromStatus(status) {
  const value = (status || "").toLowerCase();
  if (/ขัดข้อง|offline|ข้อมูลเก่า/.test(value)) return "OFFLINE";
  if (/critical|วิกฤต|น้ำท่วม$/.test(value)) return "CRITICAL";
  if (/warning|เตือนภัย/.test(value)) return "WARNING";
  if (/watch|น้ำท่วมขังเล็กน้อย/.test(value)) return "WATCH";
  if (/normal|ปกติ/.test(value)) return "NORMAL";
  return "UNKNOWN";
}

function rainfallSeverity(rain1h, status) {
  const source = severityFromStatus(status);
  if (source === "OFFLINE" || source === "CRITICAL" || source === "WARNING") return source;
  if (rain1h == null) return source === "NORMAL" ? "NORMAL" : "UNKNOWN";
  if (rain1h > 90) return "CRITICAL";
  if (rain1h > 35) return "WARNING";
  if (rain1h > 10) return "WATCH";
  return "NORMAL";
}

async function fetchJson(label, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ThonburiFloodWatchRelay/1.0; +https://thonburi-flood-watch.vercel.app)",
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "th-TH,th;q=0.9,en;q=0.7",
          Referer: "https://flood.bangkok.go.th/",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      console.error(`[${label}] attempt ${attempt}:`, error instanceof Error ? error.message : error);
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : "fetch failed"}`);
}

function buildRain(payload, queryTime) {
  const rows = asRows(payload);
  const indexed = indexRows(rows);

  return RAIN_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row) {
      return {
        ...meta,
        kind: "RAIN",
        observedAt: queryTime,
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
        severity: "NORMAL",
      };
    }

    const obs = observed(row);
    const rain1h = numberValue(row, [
      "rain_60", "rain60", "rain60m", "rain_1h", "rain1h",
      "rf_60", "rf60", "rainfall", "rain", "rf", "value", "sum_rain",
    ]);
    const status = apiStatusText(stringValue(row, ["status", "status_en", "state"])) || "ปกติ";

    return {
      ...meta,
      name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name,
      kind: "RAIN",
      observedAt: obs.iso,
      observedAtRaw: obs.raw,
      sourceStatus: status,
      rain5m: numberValue(row, ["rain_5", "rain5", "rain5m", "rf_5", "rf5"]),
      rain15m: numberValue(row, ["rain_15", "rain15", "rain15m", "rf_15", "rf15"]),
      rain30m: numberValue(row, ["rain_30", "rain30", "rain30m", "rf_30", "rf30"]),
      rain1h,
      rain3h: numberValue(row, ["rain_180", "rain180", "rain3h", "rf_180", "rf180"]),
      rain6h: null,
      rain12h: null,
      rain24h: numberValue(row, ["rain_1440", "rain24h", "rain24", "rf_1440"]),
      severity: rainfallSeverity(rain1h, status),
    };
  });
}

function buildWater(mainPayload, statusPayload) {
  const rows = [...asRows(statusPayload), ...asRows(mainPayload)];
  const indexed = indexRows(rows);

  return WATER_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row) {
      return {
        ...meta,
        kind: "WATER",
        observedAt: null,
        observedAtRaw: "",
        sourceStatus: "ไม่พบสถานีใน BMA Flood API",
        levelInside: null,
        levelOutside: null,
        riverLevel: null,
        severity: "OFFLINE",
      };
    }

    const obs = observed(row);
    const status = apiStatusText(stringValue(row, ["status", "status_en", "state"]));

    return {
      ...meta,
      name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name,
      kind: "WATER",
      observedAt: obs.iso,
      observedAtRaw: obs.raw,
      sourceStatus: status || "ไม่ทราบสถานะ",
      levelInside: numberValue(row, ["wl_in", "level_in", "water_level_in", "value"]),
      levelOutside: numberValue(row, ["wl_out", "level_out", "water_level_out"]),
      riverLevel: numberValue(row, ["wl_m", "river_level", "water_level"]),
      severity: severityFromStatus(status),
    };
  });
}

function buildRoad(statusPayload, eventPayload) {
  const statusRows = asRows(statusPayload);
  const eventRows = asRows(eventPayload);
  const indexed = indexRows([...eventRows, ...statusRows]);
  const noActiveEvents = eventRows.length === 0;

  return ROAD_STATIONS.map((meta) => {
    const row = indexed.get(meta.code);
    if (!row) {
      return {
        ...meta,
        kind: "ROAD_FLOOD",
        observedAt: null,
        observedAtRaw: "",
        sourceStatus: noActiveEvents ? "ไม่พบเหตุการณ์น้ำท่วมที่เปิดอยู่" : "ไม่พบเหตุการณ์ที่สถานีนี้",
        depthCm: null,
        severity: "NORMAL",
      };
    }

    const obs = observed(row);
    const rawStatus = apiStatusText(stringValue(row, ["status", "status_en", "state"]));
    const depthCm = numberValue(row, ["flood_depth", "depth_cm", "depth", "water_depth", "wl", "value"]);
    const status =
      rawStatus ||
      (depthCm == null ? "ไม่ทราบสถานะ" : depthCm > 10 ? "วิกฤต" : depthCm >= 5 ? "เตือนภัย" : "ปกติ");

    return {
      ...meta,
      name: stringValue(row, ["st_name", "station_name", "name"]) || meta.name,
      road: stringValue(row, ["road_name", "road", "location"]) || meta.road,
      kind: "ROAD_FLOOD",
      observedAt: obs.iso,
      observedAtRaw: obs.raw,
      sourceStatus: status,
      depthCm,
      severity: severityFromStatus(status),
    };
  });
}

async function optionalFetch(label, url) {
  try {
    return { ok: true, value: await fetchJson(label, url), error: null };
  } catch (error) {
    return { ok: false, value: null, error: error instanceof Error ? error.message : "fetch failed" };
  }
}

async function main() {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const rainUrl = `${API_BASE}/rain/stationstatus_dt?period=60&datetime=${encodeURIComponent(now)}`;
  const waterStatusUrl = `${API_BASE}/water/stationstatus_dt?period=5&datetime=${encodeURIComponent(now)}`;
  const floodStatusUrl = `${API_BASE}/flood/stationstatus_dt?period=5&datetime=${encodeURIComponent(now)}`;

  const [rainResult, mainWaterResult, waterStatusResult, floodStatusResult, eventResult] = await Promise.all([
    optionalFetch("rain", rainUrl),
    optionalFetch("mainwater", `${API_BASE}/mainwater/lastdata/0`),
    optionalFetch("water-status", waterStatusUrl),
    optionalFetch("flood-status", floodStatusUrl),
    optionalFetch("flood-currentevent", `${API_BASE}/flood/currentevent`),
  ]);

  const categoryErrors = [];
  if (!rainResult.ok) categoryErrors.push(`Rain: ${rainResult.error}`);
  if (!mainWaterResult.ok && !waterStatusResult.ok) {
    categoryErrors.push(`Water: ${mainWaterResult.error} | ${waterStatusResult.error}`);
  }
  if (!floodStatusResult.ok && !eventResult.ok) {
    categoryErrors.push(`Road Flood: ${floodStatusResult.error} | ${eventResult.error}`);
  }

  if (categoryErrors.length) {
    throw new Error(`BMA relay could not refresh required categories: ${categoryErrors.join(" • ")}`);
  }

  const rain = buildRain(rainResult.value, new Date().toISOString());
  const water = buildWater(mainWaterResult.value, waterStatusResult.value);
  const roadFlood = buildRoad(floodStatusResult.value, eventResult.value);

  const missingWater = water.filter((station) => station.severity === "OFFLINE").length;
  const errors = [];
  if (missingWater) errors.push(`BMA Water: ไม่พบ ${missingWater} สถานีเป้าหมาย`);

  const snapshot = {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    rain,
    water,
    roadFlood,
    errors,
    sources: {
      rain: rainUrl,
      water: `${API_BASE}/mainwater/lastdata/0`,
      roadFlood: floodStatusUrl,
    },
  };

  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
  console.log(`Rain stations: ${rain.length}, water stations: ${water.length}, road stations: ${roadFlood.length}`);
  console.log(`Snapshot ok: ${snapshot.ok}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
