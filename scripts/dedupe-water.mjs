import fs from "node:fs/promises";

const inputPath = process.argv[2] || "/tmp/bma-latest.json";

function sourceKey(station) {
  const status = String(station?.sourceStatus || "");
  if (!status.includes("ThaiWater fallback")) return `bma:${station?.code || station?.name || "unknown"}`;

  const lat = Number(station?.latitude);
  const lon = Number(station?.longitude);
  const coordKey = Number.isFinite(lat) && Number.isFinite(lon)
    ? `${lat.toFixed(5)},${lon.toFixed(5)}`
    : "no-coord";
  const nameKey = String(station?.name || "unknown").trim().toLowerCase();
  return `thaiwater:${nameKey}:${coordKey}`;
}

const raw = await fs.readFile(inputPath, "utf8");
const snapshot = JSON.parse(raw);

if (!Array.isArray(snapshot.water)) {
  throw new Error("Relay snapshot does not contain a water array");
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
console.log(`Water station dedupe complete: kept=${unique.length}, removed=${removed}`);
