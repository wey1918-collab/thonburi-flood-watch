"use client";

import { useEffect, useMemo, useState } from "react";
import FloodMap from "@/components/FloodMap";
import StatusBadge from "@/components/StatusBadge";
import { buildFloodMapPoints } from "@/lib/map-points";
import type { RoadFloodStation, Severity, WaterStation } from "@/lib/bma/types";
import type { LiveOverview } from "@/lib/overview/types";

type GaugeLevel = 0 | 1 | 2 | 3;
type RoadGaugeLevel = 0 | 1 | 2 | 3 | 4 | 5;
type HealthState = "LIVE" | "FALLBACK" | "STALE" | "OFFLINE" | "PREDICT";

const severityRank: Record<Severity, number> = {
  UNKNOWN: 0,
  NORMAL: 1,
  OFFLINE: 0,
  WATCH: 2,
  WARNING: 3,
  CRITICAL: 4,
};

const ROAD_MONITORS = [
  { code: "MON.CHARAN", label: "ถนนจรัญสนิทวงศ์" },
  { code: "MON.BANGKRUI", label: "ถนนบางกรวย-ไทรน้อย" },
  { code: "MON.RATCHAPHRUEK", label: "ถนนราชพฤกษ์" },
  { code: "FL.BKN.01", label: "ถนนอิสรภาพ ช่วงตลาดพรานนก" },
  { code: "FL.BKN.02", label: "ถนนบรมราชชนนี ช่วงสายใต้" },
] as const;

function fmt(value: number | null | undefined, unit: string, decimals = 1) {
  return value == null ? "—" : `${value.toFixed(decimals)} ${unit}`;
}

function displayTime(iso: string | null | undefined, includeDate = true) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      ...(includeDate ? { dateStyle: "medium" as const } : {}),
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function displayRange(start: string, end: string) {
  const a = displayTime(start, false);
  const b = displayTime(end, false);
  return a === b ? a : `${a}–${b}`;
}

function severityToLevel(severity: Severity | null | undefined): GaugeLevel {
  if (severity === "NORMAL") return 1;
  if (severity === "WATCH") return 2;
  if (severity === "WARNING" || severity === "CRITICAL") return 3;
  return 0;
}

function levelToSeverity(level: GaugeLevel): Severity {
  if (level === 1) return "NORMAL";
  if (level === 2) return "WATCH";
  if (level === 3) return "WARNING";
  return "UNKNOWN";
}

function levelLabel(level: GaugeLevel) {
  if (level === 1) return "ระดับ 1 • ปกติ";
  if (level === 2) return "ระดับ 2 • เฝ้าระวัง";
  if (level === 3) return "ระดับ 3 • เตือน";
  return "ยังไม่มีข้อมูลสด";
}

function rainLevel(mm: number | null | undefined): GaugeLevel {
  if (mm == null) return 0;
  if (mm <= 10) return 1;
  if (mm <= 35) return 2;
  return 3;
}

function roadLevel(cm: number | null | undefined): GaugeLevel {
  if (cm == null) return 0;
  if (cm < 5) return 1;
  if (cm < 10) return 2;
  return 3;
}
function roadFiveLevel(cm: number | null | undefined): RoadGaugeLevel {
  if (cm == null) return 0;
  if (cm < 5) return 1;
  if (cm < 10) return 2;
  if (cm < 15) return 3;
  if (cm < 20) return 4;
  return 5;
}

function roadFiveLevelLabel(level: RoadGaugeLevel, stale: boolean) {
  if (stale) return "ข้อมูลเก่า • ไม่ใช้จัดระดับ";
  if (level === 1) return "ระดับ 1 • ปกติ";
  if (level === 2) return "ระดับ 2 • น้ำท่วมขังเล็กน้อย";
  if (level === 3) return "ระดับ 3 • น้ำท่วม";
  if (level === 4) return "ระดับ 4 • น้ำสูง";
  if (level === 5) return "ระดับ 5 • รุนแรง";
  return "ยังไม่มีข้อมูล";
}

function worstAvailable(values: Array<Severity | null | undefined>): Severity {
  const fresh = values.filter((value): value is Severity => Boolean(value && value !== "OFFLINE" && value !== "UNKNOWN"));
  if (!fresh.length) return "UNKNOWN";
  return fresh.reduce<Severity>((worst, current) => severityRank[current] > severityRank[worst] ? current : worst, "NORMAL");
}

function sourceIsThaiWater(status: string | undefined) {
  return Boolean(status && /ThaiWater/.test(status));
}

function TriGauge({ icon, title, value, level, bands, source, note }: {
  icon: string;
  title: string;
  value: string;
  level: GaugeLevel;
  bands: [string, string, string];
  source: string;
  note: string;
}) {
  return (
    <article className={`v08-gauge-card v08-level-${level}`}>
      <div className="v08-gauge-head">
        <span className="v08-gauge-icon" aria-hidden="true">{icon}</span>
        <span className="v08-source-chip">{source}</span>
      </div>
      <h3>{title}</h3>
      <div className="v08-gauge-value">{value}</div>
      <div className={`v08-level-label level-${level}`}>{levelLabel(level)}</div>
      <div className="v08-three-level" aria-label="มาตรวัดสามระดับ">
        {bands.map((band, index) => {
          const segmentLevel = (index + 1) as 1 | 2 | 3;
          return (
            <div className={`v08-segment seg-${segmentLevel} ${level === segmentLevel ? "active" : ""}`} key={band}>
              <b>{segmentLevel}</b><span>{band}</span>
            </div>
          );
        })}
      </div>
      <p>{note}</p>
    </article>
  );
}

function Health({ name, state }: { name: string; state: HealthState }) {
  return <span className={`v08-health health-${state.toLowerCase()}`}><i />{name}<b>{state}</b></span>;
}

function RoadMonitor({ road, label }: { road: RoadFloodStation | undefined; label: string }) {
  const stale = Boolean(road && (road.severity === "OFFLINE" || /ข้อมูลเก่า|stale|ขัดข้อง/i.test(road.sourceStatus)));
  const calculatedLevel = roadFiveLevel(road?.depthCm);
  const shownLevel: RoadGaugeLevel = stale ? 0 : calculatedLevel;
  const segmentClass = (segment: 1 | 2 | 3 | 4 | 5) => `${shownLevel >= segment ? "active" : ""} ${shownLevel === segment ? "current" : ""}`.trim();
  return (
    <article className={`v08-road-card v08-level-${shownLevel}`}>
      <div className="v08-road-title"><span>🚗</span><strong>{label}</strong></div>
      <div className="v08-road-value">{road?.depthCm == null ? "—" : `${road.depthCm.toFixed(1)} cm`}</div>
      <div className={`v08-level-label level-${shownLevel}`}>{roadFiveLevelLabel(shownLevel, stale)}</div>
      <div className="v08-road-scale" aria-label="มาตรวัดระดับน้ำท่วมถนนห้าระดับ">
        <span className={segmentClass(1)}>1<br/><small>&lt; 5 cm</small></span>
        <span className={segmentClass(2)}>2<br/><small>5–&lt;10</small></span>
        <span className={segmentClass(3)}>3<br/><small>10–&lt;15</small></span>
        <span className={segmentClass(4)}>4<br/><small>15–&lt;20</small></span>
        <span className={segmentClass(5)}>5<br/><small>≥ 20 cm</small></span>
      </div>
      <p>{road ? `${road.sourceStatus} • ${road.observedAtRaw || displayTime(road.observedAt)}` : "กำลังรอข้อมูลจาก road monitor"}</p>
    </article>
  );
}

function WaterStationGauge({ station }: { station: WaterStation }) {
  const level = severityToLevel(station.severity);
  return (
    <TriGauge
      icon="💧"
      title={station.name}
      value={fmt(station.levelInside, sourceIsThaiWater(station.sourceStatus) ? "m MSL" : "ม.รทก.", 2)}
      level={level}
      bands={["สถานะ 1 ปกติ", "สถานะ 2 เฝ้าระวัง", "สถานะ 3+ เตือน"]}
      source={sourceIsThaiWater(station.sourceStatus) ? "ThaiWater" : "BMA"}
      note={`${station.sourceStatus} • ${station.observedAtRaw || displayTime(station.observedAt)}`}
    />
  );
}

export default function LiveDashboardV08() {
  const [data, setData] = useState<LiveOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(manual = false) {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/overview/live", { cache: "no-store" });
      const body = (await response.json()) as LiveOverview;
      if (!response.ok) throw new Error(body.errors?.join(" • ") || "โหลดข้อมูลไม่สำเร็จ");
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const bma = data?.bma;
  const thaiWater = data?.thaiWater;
  const tmd = data?.tmd;
  const rid = data?.ridC29;
  const tide = data?.tide;
  const gistda = data?.gistda;
  const mapPoints = useMemo(() => bma ? buildFloodMapPoints(bma) : [], [bma]);

  const bknRain = bma?.rain.filter((station) => station.district === "บางกอกน้อย") ?? [];
  const rainStation = bknRain.length
    ? bknRain.reduce((best, station) => (station.rain1h ?? -1) > (best.rain1h ?? -1) ? station : best)
    : undefined;
  const rainMm = rainStation?.rain1h ?? thaiWater?.rain?.rain1h ?? null;
  const currentRainLevel = rainLevel(rainMm);

  const primaryWater = bma?.water.find((station) => station.code === "WL.KMN.01") ?? bma?.water[0];
  const waterLevel = severityToLevel(primaryWater?.severity ?? thaiWater?.water[0]?.severity);
  const waterValue = primaryWater?.levelInside ?? thaiWater?.water[0]?.levelMslM ?? null;
  const waterUnit = primaryWater && !sourceIsThaiWater(primaryWater.sourceStatus) ? "ม.รทก." : "m MSL";

  const requestedRoads = ROAD_MONITORS.map((target) => ({
    ...target,
    road: bma?.roadFlood.find((road) => road.code === target.code),
  }));
  const requestedRoadValues = requestedRoads.map((item) => item.road).filter((road): road is RoadFloodStation => Boolean(road));
  const freshRoadDepths = requestedRoadValues.filter((road) => road.severity !== "OFFLINE").map((road) => road.depthCm).filter((value): value is number => value != null);
  const maxRoadDepth = freshRoadDepths.length ? Math.max(...freshRoadDepths) : null;
  const currentRoadLevel = roadLevel(maxRoadDepth);

  const overall = worstAvailable([
    levelToSeverity(currentRainLevel),
    primaryWater?.severity ?? thaiWater?.water[0]?.severity,
    ...requestedRoadValues.map((road) => road.severity),
  ]);

  const fallbackActive = Boolean(bma && [...bma.rain, ...bma.water, ...bma.roadFlood].some((station) => sourceIsThaiWater(station.sourceStatus)));
  const bmaDirect = Boolean(bma && !fallbackActive && Object.values(bma.sources).some((url) => /bangkok\.go\.th/.test(url)));
  const bmaState: HealthState = bmaDirect ? "LIVE" : fallbackActive ? "FALLBACK" : "OFFLINE";
  const twState: HealthState = thaiWater?.ok ? (thaiWater.via === "direct" ? "LIVE" : "FALLBACK") : "OFFLINE";
  const tmdState: HealthState = tmd?.ok ? "LIVE" : "OFFLINE";
  const ridState: HealthState = rid?.ok ? (rid.stale ? "STALE" : "LIVE") : "OFFLINE";
  const gistdaState: HealthState = gistda?.ok ? "LIVE" : "OFFLINE";
  const tideState: HealthState = tide?.ok ? "PREDICT" : "OFFLINE";

  return (
    <div className="dashboard-v08">
      <header className="v08-header">
        <div>
          <span className="section-kicker">BANGKOK • MULTI-SOURCE FLOOD DASHBOARD V0.9</span>
          <h1>Thonburi Flood Watch</h1>
          <p>บางกอกน้อย • ธนบุรี • บางกอกใหญ่ • แนวถนนเชื่อมบางกรวย</p>
        </div>
        <button className="refresh-button" type="button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? "กำลังอัปเดต…" : "↻ อัปเดต"}</button>
      </header>

      <section className={`v08-summary v08-summary-${severityToLevel(overall)}`}>
        <div>
          <span>ภาพรวมจากแหล่งข้อมูลที่พร้อมใช้งาน</span>
          <h2>{overall === "UNKNOWN" ? "กำลังตรวจข้อมูล" : overall === "NORMAL" ? "สถานการณ์อยู่ในระดับ 1" : overall === "WATCH" ? "มีข้อมูลระดับ 2 ที่ควรเฝ้าระวัง" : "มีข้อมูลระดับ 3 ที่ควรตรวจสอบ"}</h2>
          <p>{loading ? "กำลังรวมข้อมูล…" : data ? `อัปเดต ${displayTime(data.generatedAt)} • รีเฟรชอัตโนมัติทุก 5 นาที` : "ยังไม่มีข้อมูล"}</p>
        </div>
        <StatusBadge status={overall} />
      </section>

      {error ? <div className="source-warning">⚠️ {error}</div> : null}

      <div className="v08-health-strip">
        <Health name="BMA" state={bmaState} /><Health name="ThaiWater" state={twState} /><Health name="TMD" state={tmdState} />
        <Health name="RID" state={ridState} /><Health name="GISTDA" state={gistdaState} /><Health name="Tide" state={tideState} />
      </div>

      <section className="v08-section">
        <div className="v08-section-head"><div><span className="section-kicker">3-LEVEL MONITOR</span><h2>ระดับน้ำและฝนแบบ 3 ระดับ</h2></div><small>ตัวเลขจริง + สี + เกณฑ์ในมุมมองเดียว</small></div>
        <div className="v08-gauge-grid">
          <TriGauge icon="🌧️" title="ฝน 1 ชั่วโมง" value={fmt(rainMm, "mm", 1)} level={currentRainLevel} bands={["≤ 10 mm", ">10–35 mm", "> 35 mm"]} source={rainStation && !sourceIsThaiWater(rainStation.sourceStatus) ? "BMA" : "ThaiWater"} note={rainStation ? `${rainStation.name} • ${rainStation.observedAtRaw || displayTime(rainStation.observedAt)}` : thaiWater?.rain ? `${thaiWater.rain.stationName} • ${thaiWater.rain.observedAtRaw || displayTime(thaiWater.rain.observedAt)}` : "ไม่มีข้อมูลฝนสด"} />
          <TriGauge icon="💧" title="ระดับน้ำใกล้พื้นที่" value={fmt(waterValue, waterUnit, 2)} level={waterLevel} bands={["สถานะ 1 ปกติ", "สถานะ 2 เฝ้าระวัง", "สถานะ 3+ เตือน"]} source={primaryWater && !sourceIsThaiWater(primaryWater.sourceStatus) ? "BMA" : "ThaiWater"} note={primaryWater ? `${primaryWater.name} • ${primaryWater.sourceStatus}` : "ใช้สถานะระดับน้ำจากต้นทาง ไม่ตั้งค่า m ตายตัวเอง"} />
          <TriGauge icon="🚗" title="น้ำบนถนน • สูงสุด 5 เส้นทาง" value={fmt(maxRoadDepth, "cm", 1)} level={currentRoadLevel} bands={["< 5 cm", "5–<10 cm", "≥ 10 cm"]} source="ROAD MONITOR" note="จรัญสนิทวงศ์ • บางกรวย-ไทรน้อย • ราชพฤกษ์ • อิสรภาพ • บรมราชชนนี" />
        </div>
        <p className="v08-threshold-note">เกณฑ์ฝนย่อจากช่วงที่ BMA แสดง (10 และ 35 มม.) และเกณฑ์ถนนใช้ 5 ซม. = เริ่มน้ำท่วมขังเล็กน้อย, 10 ซม. = น้ำท่วม; ส่วนระดับน้ำคลองใช้สถานะจากต้นทาง เพราะแต่ละสถานีมี datum/ตลิ่งต่างกัน</p>
      </section>

      <section className="v08-section">
        <div className="v08-section-head"><div><span className="section-kicker">ROAD 5-LEVEL DASHBOARD</span><h2>ถนน 5 เส้น • Dashboard 5 ระดับ</h2></div><small>ตัวเลขจริง + ระดับ 1–5; ข้อมูลเก่าจะไม่ถูกตีความว่าเป็นระดับ 1</small></div>
        <div className="v08-road-grid">
          {requestedRoads.map((item) => <RoadMonitor key={item.code} road={item.road} label={item.label} />)}
        </div>
        <p className="v08-threshold-note">BMA ระบุเกณฑ์หลักของน้ำท่วมถนนที่ 5 ซม. = น้ำท่วมขังเล็กน้อย และ 10 ซม. = น้ำท่วม ส่วนระดับ 3–5 ในแดชบอร์ดนี้แบ่งช่วง 10–&lt;15, 15–&lt;20 และ ≥20 ซม. เพื่อให้อ่านความรุนแรงได้ละเอียดขึ้น ไม่ใช่ระดับประกาศทางการของ BMA</p>
      </section>

      <section className="v08-section">
        <div className="v08-section-head"><div><span className="section-kicker">LOCAL WATER</span><h2>ระดับน้ำคลอง/สถานีใกล้พื้นที่</h2></div><small>ยุบเป็น 3 ระดับเพื่ออ่านเร็ว พร้อมค่าระดับจริง</small></div>
        <div className="v08-gauge-grid">
          {(bma?.water ?? []).slice(0, 4).map((station) => <WaterStationGauge station={station} key={station.code} />)}
          {!bma?.water?.length ? <div className="empty-state">ยังไม่มีข้อมูลระดับน้ำ</div> : null}
        </div>
      </section>

      <section className="v08-context-grid">
        <article><span>☁️ TMD • โอกาสฝน</span><strong>{tmd?.rainChancePercent == null ? "—" : `${tmd.rainChancePercent}%`}</strong><p>{tmd?.summary || tmd?.issuedAtRaw || "พยากรณ์ กทม./ปริมณฑล"}</p></article>
        <article><span>🏞️ RID C.29 • บางไทร</span><strong>{fmt(rid?.flowM3s, "m³/s", 0)}</strong><p>{rid?.ok ? `${rid.trend === "RISING" ? "↑ เพิ่มขึ้น" : rid.trend === "FALLING" ? "↓ ลดลง" : "→ ทรงตัว"}${rid.changePercent == null ? "" : ` ${rid.changePercent > 0 ? "+" : ""}${rid.changePercent.toFixed(1)}%`}` : "RID unavailable"}</p></article>
        <article><span>🌙 Bangkok Port • น้ำสูงถัดไป</span><strong>{tide?.nextHigh ? `${tide.nextHigh.levelMslM.toFixed(2)} m` : "—"}</strong><p>{tide?.nextHigh ? `${displayRange(tide.nextHigh.startAt, tide.nextHigh.endAt)} • PREDICTION` : "Tide unavailable"}</p></article>
        <article><span>🛰️ GISTDA • Flood layer</span><strong>{gistda?.intersectingFeatureCount == null ? "—" : `${gistda.intersectingFeatureCount}`}</strong><p>{gistda?.ok ? "polygon ที่ตัดกับกรอบพื้นที่ตรวจสอบ" : "GISTDA unavailable"}</p></article>
      </section>

      <section className="v08-section v08-map-card">
        <div className="v08-section-head"><div><span className="section-kicker">MAP</span><h2>แผนที่สถานการณ์และจุด Road Monitor</h2></div><span className="live-chip">MULTI-SOURCE</span></div>
        <FloodMap points={mapPoints} />
        <p className="v08-threshold-note">หมุด Road Monitor ครอบคลุมจรัญสนิทวงศ์ บางกรวย-ไทรน้อย ราชพฤกษ์ อิสรภาพ และบรมราชชนนี หากต้นทางไม่มีเซนเซอร์ตรงชื่อถนน ระบบจะใช้เฉพาะเซนเซอร์ใกล้เคียงภายในระยะที่กำหนดและระบุว่า “สถานีใกล้เคียง” ไม่ถือว่าเป็นค่าของถนนนั้นโดยตรง</p>
      </section>

      <details className="detail-disclosure v08-details">
        <summary><span>ถนน 5 เส้นและสถานีทั้งหมด</span><small>{bma?.roadFlood.length ?? 0} จุด</small></summary>
        <div className="road-list compact-road-list">
          {(bma?.roadFlood ?? []).map((road) => <div className="road-row" key={road.code}><div><strong>{road.name}</strong><span>{road.code} • {road.sourceStatus} • {road.observedAtRaw || "ไม่มีเวลาอัปเดต"}</span></div><b>{road.depthCm == null ? "—" : `${road.depthCm.toFixed(1)} cm`}</b></div>)}
        </div>
      </details>

      <details className="detail-disclosure v08-details">
        <summary><span>แหล่งข้อมูล</span><small>ตรวจสอบต้นทาง</small></summary>
        <div className="source-list source-links-v07">
          <a href="https://floodbangkok.bangkok.go.th/road-flood" target="_blank" rel="noreferrer">BMA Road Flood</a>
          <a href={thaiWater?.sources.roadFlood || "https://www.thaiwater.net"} target="_blank" rel="noreferrer">ThaiWater / สสน.</a>
          <a href={tmd?.sourceUrl || "https://www.tmd.go.th/forecast/daily"} target="_blank" rel="noreferrer">TMD</a>
          <a href={rid?.sourceUrl || "https://www.rid.go.th/th/water-situation"} target="_blank" rel="noreferrer">RID</a>
          <a href={gistda?.sourceUrl || "https://gistdaportal.gistda.or.th"} target="_blank" rel="noreferrer">GISTDA</a>
          <a href={tide?.sourceUrl || "https://hydro.navy.mi.th/waterlaveltable"} target="_blank" rel="noreferrer">Tide Table</a>
        </div>
      </details>
    </div>
  );
}
