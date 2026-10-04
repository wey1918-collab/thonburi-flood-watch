import { MAP_RAIN_CODES } from "@/lib/bma/stations";
import type { BmaLiveSnapshot, Severity } from "@/lib/bma/types";

export type FloodMapPoint = {
  id: string;
  name: string;
  subtitle: string;
  longitude: number;
  latitude: number;
  status: Severity;
  value: string;
  note: string;
  kind: "RAIN" | "WATER" | "ROAD_FLOOD";
};

function fmt(value: number | null, suffix: string) {
  return value == null ? "ไม่มีข้อมูล" : `${value.toFixed(value % 1 === 0 ? 0 : 2)} ${suffix}`;
}

export function buildFloodMapPoints(snapshot: BmaLiveSnapshot): FloodMapPoint[] {
  const rain = snapshot.rain
    .filter((s) => MAP_RAIN_CODES.has(s.code))
    .map((s) => ({
      id: s.code,
      name: s.name,
      subtitle: `${s.code} • สถานีวัดฝน • ${s.district}`,
      longitude: s.longitude,
      latitude: s.latitude,
      status: s.severity,
      value: fmt(s.rain1h, "mm/1h"),
      note: `BMA DDS • ${s.observedAtRaw || "ไม่พบเวลาอัปเดต"}`,
      kind: "RAIN" as const,
    }));

  const water = snapshot.water.map((s) => ({
    id: s.code,
    name: s.name,
    subtitle: `${s.code} • ระดับน้ำ • ${s.district}`,
    longitude: s.longitude,
    latitude: s.latitude,
    status: s.severity,
    value: fmt(s.levelInside, "ม.รทก."),
    note: `ด้านนอก ${fmt(s.levelOutside, "ม.รทก.")} • BMA DDS • ${s.observedAtRaw || "ไม่พบเวลาอัปเดต"}`,
    kind: "WATER" as const,
  }));

  const road = snapshot.roadFlood.map((s) => ({
    id: s.code,
    name: s.name,
    subtitle: `${s.code} • น้ำท่วมถนน • ${s.district}`,
    longitude: s.longitude,
    latitude: s.latitude,
    status: s.severity,
    value: fmt(s.depthCm, "cm"),
    note: `BMA DDS • ${s.observedAtRaw || "ไม่พบเวลาอัปเดต"}`,
    kind: "ROAD_FLOOD" as const,
  }));

  return [...rain, ...water, ...road];
}
