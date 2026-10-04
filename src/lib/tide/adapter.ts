import { BANGKOK_PORT_2026_MSL } from "./bangkok-port-2026";
import type { TidePoint, TideSnapshot } from "./types";

export const TIDE_SOURCE = "https://hydro.navy.mi.th/storage/frontend/article/22987/file/th/BH2026msl.pdf";

function bangkokParts(date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(date).map((v) => [v.type, v.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) };
}

function atIso(year: number, month: number, day: number, hour: number) {
  const local = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+07:00`;
  return new Date(local).toISOString();
}

function findHighPlateaus(points: TidePoint[]) {
  const result: Array<{ startAt: string; endAt: string; levelMslM: number }> = [];
  let i = 0;
  while (i < points.length) {
    let j = i;
    while (j + 1 < points.length && points[j + 1].levelMslM === points[i].levelMslM) j++;
    const left = i > 0 ? points[i - 1].levelMslM : -Infinity;
    const right = j + 1 < points.length ? points[j + 1].levelMslM : -Infinity;
    if (points[i].levelMslM >= left && points[j].levelMslM >= right && (points[i].levelMslM > left || points[j].levelMslM > right)) {
      result.push({ startAt: points[i].at, endAt: points[j].at, levelMslM: points[i].levelMslM });
    }
    i = j + 1;
  }
  return result;
}

export function getBangkokPortTide(date = new Date()): TideSnapshot {
  const { year, month, day, hour } = bangkokParts(date);
  const values = year === 2026 ? BANGKOK_PORT_2026_MSL[month]?.[day] : undefined;
  if (!values || values.length !== 24) {
    return {
      ok: false,
      station: "ท่าเรือกรุงเทพ (Bangkok Port)",
      stationCode: "BANGKOK_PORT",
      datum: "MSL",
      isPrediction: true,
      currentHour: null,
      nextHigh: null,
      today: [],
      sourceUrl: TIDE_SOURCE,
      note: "Starter V0.3 ฝังข้อมูลมาตราน้ำอย่างเป็นทางการเฉพาะเดือนตุลาคม 2569; นอกช่วงนี้จะไม่สร้างค่าจำลอง",
      error: "ไม่มีตารางทำนายน้ำสำหรับวันที่นี้ใน Starter V0.3",
    };
  }

  const today = values.map((levelMslM, h) => ({ at: atIso(year, month, day, h), levelMslM }));
  const nowMs = date.getTime();
  const highs = findHighPlateaus(today);
  const nextHigh = highs.find((x) => new Date(x.endAt).getTime() >= nowMs) ?? null;

  return {
    ok: true,
    station: "ท่าเรือกรุงเทพ (Bangkok Port)",
    stationCode: "BANGKOK_PORT",
    datum: "MSL",
    isPrediction: true,
    currentHour: today[Math.min(23, Math.max(0, hour))] ?? null,
    nextHigh,
    today,
    sourceUrl: TIDE_SOURCE,
    note: "ค่าทำนายรายชั่วโมง หน่วยเมตรเหนือระดับทะเลปานกลาง (MSL) — ไม่ใช่ค่าตรวจวัดสด",
  };
}
