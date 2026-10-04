import type { StationMeta } from "./types";

// Coordinates are from BMA Drainage and Sewerage Department station inventories.
// Only official station points are used here; no landmark/prototype coordinates remain.
export const RAIN_STATIONS: StationMeta[] = [
  { code: "RF.BKN.01", name: "สนข.บางกอกน้อย", district: "บางกอกน้อย", latitude: 13.77078, longitude: 100.46806 },
  { code: "RF.BKN.02", name: "ส.คลองมอญ", district: "บางกอกน้อย", latitude: 13.74714, longitude: 100.48531 },
  { code: "RF.TBR.01", name: "สนข.ธนบุรี", district: "ธนบุรี", latitude: 13.72497, longitude: 100.48558 },
  { code: "RF.TBR.02", name: "ส.คลองสำเหร่", district: "ธนบุรี", latitude: 13.70670, longitude: 100.49646 },
  { code: "RF.BKY.01", name: "สนข.บางกอกใหญ่", district: "บางกอกใหญ่", latitude: 13.72332, longitude: 100.47622 },
  { code: "RF.BKY.02", name: "ส.คลองบางกอกใหญ่", district: "บางกอกใหญ่", latitude: 13.74022, longitude: 100.49012 },
];

export const WATER_STATIONS: StationMeta[] = [
  { code: "WL.KMN.01", name: "ส.คลองมอญ", district: "บางกอกน้อย", latitude: 13.74703, longitude: 100.48489 },
  { code: "WL.BBR.01", name: "ค.บางบำหรุ ถ.บรมราชชนนี", district: "บางกอกน้อย", latitude: 13.77927, longitude: 100.47591 },
  { code: "WL.BKY.01", name: "ส.คลองบางกอกใหญ่", district: "ธนบุรี", latitude: 13.74020, longitude: 100.48992 },
  { code: "WL.SRE.01", name: "ส.คลองสำเหร่", district: "ธนบุรี", latitude: 13.70671, longitude: 100.49647 },
];

export const ROAD_FLOOD_STATIONS: Array<StationMeta & { road: string }> = [
  { code: "FL.BKN.01", name: "ถ.อิสรภาพ (ตลาดพรานนก)", road: "ถนนอิสรภาพ", district: "บางกอกน้อย", latitude: 13.75470, longitude: 100.47810 },
  { code: "FL.BKN.02", name: "ถ.บรมราชชนนี (สายใต้)", road: "ถนนบรมราชชนนี", district: "บางกอกน้อย", latitude: 13.78705, longitude: 100.46802 },
];

// Rain stations shown as map pins. Pump-station rain gauges overlap water-level sensors,
// so the map uses district-office rain gauges and keeps all gauges in the data table/API.
export const MAP_RAIN_CODES = new Set(["RF.BKN.01", "RF.TBR.01", "RF.BKY.01"]);
