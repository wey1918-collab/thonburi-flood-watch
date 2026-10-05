"use client";

import { useEffect, useMemo, useState } from "react";
import FloodMap from "@/components/FloodMap";
import StatusBadge from "@/components/StatusBadge";
import { buildFloodMapPoints } from "@/lib/map-points";
import type { Severity, RainStation, WaterStation } from "@/lib/bma/types";
import type { LiveOverview } from "@/lib/overview/types";

type CardTone = "normal" | "watch" | "warning" | "critical" | "offline" | "prediction";
type SourceState = "LIVE" | "FALLBACK" | "STALE" | "OFFLINE" | "PREDICT";

const rank: Record<Severity, number> = {
  UNKNOWN: 0,
  NORMAL: 1,
  OFFLINE: 2,
  WATCH: 3,
  WARNING: 4,
  CRITICAL: 5,
};

function isThaiWater(status: string | null | undefined) {
  return Boolean(status && /ThaiWater/.test(status));
}

function worstLocalStatus(data: LiveOverview | null): Severity {
  if (!data?.bma) return "UNKNOWN";
  const direct = [...data.bma.rain, ...data.bma.water, ...data.bma.roadFlood]
    .filter((station) => !isThaiWater(station.sourceStatus));
  if (!direct.length) return "UNKNOWN";
  return direct.map((station) => station.severity)
    .reduce<Severity>((worst, current) => rank[current] > rank[worst] ? current : worst, "NORMAL");
}

function worstSeverity(values: Severity[]): Severity {
  if (!values.length) return "UNKNOWN";
  return values.reduce<Severity>((worst, current) => rank[current] > rank[worst] ? current : worst, "NORMAL");
}

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

function displayTimeRange(start: string, end: string) {
  const a = displayTime(start, false);
  const b = displayTime(end, false);
  return a === b ? a : `${a}–${b}`;
}

function toneFromSeverity(status: Severity): CardTone {
  if (status === "CRITICAL") return "critical";
  if (status === "WARNING") return "warning";
  if (status === "WATCH") return "watch";
  if (status === "OFFLINE" || status === "UNKNOWN") return "offline";
  return "normal";
}

function trendLabel(trend: string) {
  if (trend === "RISING") return "↑ เพิ่มขึ้น";
  if (trend === "FALLING") return "↓ ลดลง";
  if (trend === "STABLE") return "→ ทรงตัว";
  return "ไม่ทราบแนวโน้ม";
}

function sensorSubtitle(station: RainStation | WaterStation | undefined, fallback = "BMA DDS") {
  if (!station) return fallback;
  const time = station.observedAtRaw || "ไม่มีเวลาอัปเดต";
  if (isThaiWater(station.sourceStatus)) return `${station.name} • ${station.sourceStatus} • ${time}`;
  return `${station.code} • ${station.name} • ${station.sourceStatus} • ${time}`;
}

function KpiCard({ icon, label, value, note, source, tone = "normal" }: {
  icon: string;
  label: string;
  value: string;
  note: string;
  source: string;
  tone?: CardTone;
}) {
  return (
    <article className={`dash-kpi dash-tone-${tone}`}>
      <div className="dash-kpi-top">
        <span className="dash-kpi-icon" aria-hidden="true">{icon}</span>
        <span className="dash-source-tag">{source}</span>
      </div>
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      <div className="dash-kpi-note">{note}</div>
    </article>
  );
}

function HealthPill({ name, state }: { name: string; state: SourceState }) {
  return (
    <div className={`health-pill health-${state.toLowerCase()}`}>
      <span className="health-dot" aria-hidden="true" />
      <span>{name}</span>
      <strong>{state}</strong>
    </div>
  );
}

function DetailMetric({ label, value, note, tone = "normal" }: {
  label: string;
  value: string;
  note: string;
  tone?: CardTone;
}) {
  return (
    <div className={`detail-metric dash-tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export default function LiveDashboard() {
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
  const gistda = data?.gistda;
  const tmd = data?.tmd;
  const rid = data?.ridC29;
  const tide = data?.tide;

  const fallbackActive = Boolean(
    bma && [...bma.rain, ...bma.water, ...bma.roadFlood].some((station) => isThaiWater(station.sourceStatus)),
  );
  const bmaDirect = Boolean(
    bma && !fallbackActive && Object.values(bma.sources).some((url) => /bangkok\.go\.th/.test(url)),
  );
  const localStatus: Severity = bmaDirect ? worstLocalStatus(data) : "UNKNOWN";
  const mapPoints = useMemo(() => bma ? buildFloodMapPoints(bma) : [], [bma]);

  const bknRain = bma?.rain.filter((station) => station.district === "บางกอกน้อย") ?? [];
  const maxRain = bknRain.length
    ? bknRain.reduce((best, station) => ((station.rain1h ?? -1) > (best.rain1h ?? -1) ? station : best))
    : undefined;

  const khlongMon = bma?.water.find((station) => station.code === "WL.KMN.01");
  const bangBamru = bma?.water.find((station) => station.code === "WL.BBR.01");
  const bangkokYai = bma?.water.find((station) => station.code === "WL.BKY.01");
  const samre = bma?.water.find((station) => station.code === "WL.SRE.01");
  const twRain = thaiWater?.rain;
  const twWater = thaiWater?.water[0];

  const roadSeverity = worstSeverity((bma?.roadFlood ?? []).map((road) => road.severity));
  const activeRoads = (bma?.roadFlood ?? []).filter((road) => road.severity !== "OFFLINE");
  const maxRoadDepth = activeRoads.length
    ? Math.max(...activeRoads.map((road) => road.depthCm ?? 0))
    : null;
  const roadValue = roadSeverity === "OFFLINE" ? "ข้อมูลเก่า" : (maxRoadDepth == null ? "—" : `${maxRoadDepth.toFixed(1)} cm`);
  const roadNote = roadSeverity === "OFFLINE"
    ? "ต้นทางถนนไม่ได้อัปเดตในช่วงที่กำหนด"
    : `${activeRoads.length} จุดที่มีข้อมูลใช้งาน`;

  const mainWaterUsesBma = bmaDirect && khlongMon?.levelInside != null;
  const mainWaterValue = mainWaterUsesBma
    ? fmt(khlongMon?.levelInside, "ม.รทก.", 2)
    : fmt(twWater?.levelMslM, "m MSL", 2);
  const mainWaterTone = mainWaterUsesBma
    ? toneFromSeverity(khlongMon?.severity ?? "UNKNOWN")
    : toneFromSeverity(twWater?.severity ?? "UNKNOWN");
  const mainWaterNote = mainWaterUsesBma
    ? sensorSubtitle(khlongMon)
    : twWater
      ? `${twWater.stationName} • ห่าง ${twWater.distanceKm.toFixed(1)} กม. • สถานีใกล้เคียง`
      : "ยังไม่มีข้อมูลระดับน้ำสำรอง";

  const rainValue = maxRain?.rain1h != null
    ? fmt(maxRain.rain1h, "mm", 1)
    : fmt(twRain?.rain1h, "mm", 1);
  const rainTone = toneFromSeverity(maxRain?.severity ?? twRain?.severity ?? "UNKNOWN");
  const rainNote = maxRain
    ? sensorSubtitle(maxRain)
    : twRain
      ? `${twRain.stationName} • ห่าง ${twRain.distanceKm.toFixed(1)} กม. • ${twRain.observedAtRaw || displayTime(twRain.observedAt)}`
      : "ยังไม่มีข้อมูลฝน";

  const tmdTone: CardTone = tmd?.heavyRain ? "warning" : (tmd?.rainChancePercent ?? 0) >= 60 ? "watch" : tmd?.ok ? "normal" : "offline";
  const ridTone: CardTone = rid?.ok ? (rid.stale ? "offline" : rid.trend === "RISING" ? "watch" : "normal") : "offline";
  const tideTone: CardTone = tide?.ok ? "prediction" : "offline";

  const bmaState: SourceState = bmaDirect ? "LIVE" : fallbackActive ? "FALLBACK" : "OFFLINE";
  const thaiWaterState: SourceState = thaiWater?.ok ? (thaiWater.via === "direct" ? "LIVE" : "FALLBACK") : "OFFLINE";
  const tmdState: SourceState = tmd?.ok ? "LIVE" : "OFFLINE";
  const ridState: SourceState = rid?.ok ? (rid.stale ? "STALE" : "LIVE") : "OFFLINE";
  const gistdaState: SourceState = gistda?.ok ? "LIVE" : "OFFLINE";
  const tideState: SourceState = tide?.ok ? "PREDICT" : "OFFLINE";

  const statusTitle = !bmaDirect
    ? "ยังสรุปสถานะท้องถิ่นจาก BMA โดยตรงไม่ได้"
    : localStatus === "NORMAL"
      ? "ยังไม่พบสัญญาณผิดปกติจากเซนเซอร์ท้องถิ่น"
      : localStatus === "WATCH"
        ? "มีสัญญาณที่ควรเฝ้าระวัง"
        : localStatus === "WARNING"
          ? "มีสัญญาณเตือนในข้อมูลท้องถิ่น"
          : localStatus === "CRITICAL"
            ? "พบสัญญาณวิกฤตในข้อมูลท้องถิ่น"
            : "กำลังตรวจสอบข้อมูลท้องถิ่น";

  const statusText = !bmaDirect
    ? "BMA direct feed ยังเข้าไม่ได้จาก Cloud จึงไม่ตีความสถานีสำรองว่าเป็นสถานี BMA เดิม ระบบยังใช้ ThaiWater/สสน., TMD, RID, GISTDA และตารางน้ำขึ้นลงเพื่อให้บริบทประกอบ"
    : "สถานะนี้สรุปจากเซนเซอร์ท้องถิ่นที่ระบบเข้าถึงได้ และควรดูแนวโน้มฝน เจ้าพระยา น้ำทะเล และประกาศทางการประกอบ";

  const watchItems: Array<{ icon: string; title: string; detail: string; tone: CardTone }> = [];
  if (!bmaDirect) {
    watchItems.push({
      icon: "📡",
      title: "BMA direct ยังไม่พร้อม",
      detail: "ข้อมูลท้องถิ่นใช้แหล่งสำรองที่ระบุชื่อและเวลาอัปเดตชัดเจน",
      tone: "offline",
    });
  }
  if (tmd?.rainChancePercent != null) {
    watchItems.push({
      icon: "🌧️",
      title: `TMD โอกาสฝน ${tmd.rainChancePercent}%`,
      detail: `${tmd.heavyRain ? "มีข้อความฝนตกหนัก • " : ""}${tmd.gustyWind ? "มีลมกระโชกแรง • " : ""}${tmd.issuedAtRaw || "พยากรณ์รายวัน"}`,
      tone: tmdTone,
    });
  }
  if (rid?.ok && rid.flowM3s != null) {
    watchItems.push({
      icon: "🌊",
      title: `RID C.29 ${rid.flowM3s.toFixed(0)} m³/s`,
      detail: `${trendLabel(rid.trend)}${rid.changePercent == null ? "" : ` ${rid.changePercent > 0 ? "+" : ""}${rid.changePercent.toFixed(1)}%`} • ${rid.observedAtRaw || displayTime(rid.observedAt)}`,
      tone: ridTone,
    });
  }
  if (tide?.nextHigh) {
    watchItems.push({
      icon: "🌙",
      title: `น้ำสูงถัดไป ${displayTimeRange(tide.nextHigh.startAt, tide.nextHigh.endAt)}`,
      detail: `${tide.nextHigh.levelMslM.toFixed(2)} m MSL • ค่าทำนาย Bangkok Port ไม่ใช่เซนเซอร์สด`,
      tone: "prediction",
    });
  }
  if ((gistda?.intersectingFeatureCount ?? 0) > 0) {
    watchItems.push({
      icon: "🛰️",
      title: `GISTDA พบ ${gistda?.intersectingFeatureCount ?? 0} polygon`,
      detail: "มีชั้นพื้นที่ประสบภัยน้ำท่วมตัดกับกรอบพื้นที่ตรวจสอบ ควรตรวจรายละเอียดพื้นที่เพิ่มเติม",
      tone: "watch",
    });
  }
  if (roadSeverity === "OFFLINE") {
    watchItems.push({
      icon: "🚗",
      title: "ข้อมูลถนนบางจุดเก่า",
      detail: "ระบบไม่ตีความค่า 0 cm ที่เก่าแล้วว่าเป็นถนนปลอดน้ำท่วมในปัจจุบัน",
      tone: "offline",
    });
  }

  return (
    <div className="dashboard-v07">
      <header className="dash-header">
        <div>
          <div className="eyebrow">BANGKOK • MULTI-SOURCE FLOOD DASHBOARD V0.7</div>
          <h1>Thonburi Flood Watch</h1>
          <p>บางกอกน้อย • ธนบุรี • บางกอกใหญ่</p>
        </div>
        <div className="dash-header-actions">
          <button className="refresh-button" type="button" onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? "กำลังอัปเดต…" : "↻ อัปเดต"}
          </button>
        </div>
      </header>

      <section className={`situation-hero situation-${toneFromSeverity(localStatus)}`}>
        <div className="situation-copy">
          <div className="situation-label">สถานการณ์ท้องถิ่น</div>
          <div className="situation-title-row">
            <h2>{statusTitle}</h2>
            <StatusBadge status={localStatus} />
          </div>
          <p>{statusText}</p>
          <div className="situation-meta">
            <span>{loading ? "กำลังรวมข้อมูล…" : data ? `อัปเดต ${displayTime(data.generatedAt)}` : "ยังไม่มีข้อมูล"}</span>
            <span>รีเฟรชอัตโนมัติทุก 5 นาที</span>
            {data?.degraded ? <span className="meta-warn">มีบางแหล่ง degraded/stale</span> : null}
          </div>
        </div>
      </section>

      {error ? <div className="source-warning">⚠️ {error}</div> : null}

      <div className="health-strip" aria-label="สถานะแหล่งข้อมูล">
        <HealthPill name="BMA" state={bmaState} />
        <HealthPill name="ThaiWater" state={thaiWaterState} />
        <HealthPill name="TMD" state={tmdState} />
        <HealthPill name="RID" state={ridState} />
        <HealthPill name="GISTDA" state={gistdaState} />
        <HealthPill name="Tide" state={tideState} />
      </div>

      <section className="dash-section">
        <div className="dash-section-head">
          <div>
            <span className="section-kicker">QUICK LOOK</span>
            <h2>ตัวชี้วัดสำคัญ</h2>
          </div>
          <span className="section-note">ดูภาพรวมภายในไม่กี่วินาที</span>
        </div>
        <div className="kpi-grid">
          <KpiCard icon="🌧️" label="ฝน 1 ชั่วโมง" value={rainValue} note={rainNote} source={maxRain && !isThaiWater(maxRain.sourceStatus) ? "BMA" : "ThaiWater"} tone={rainTone} />
          <KpiCard icon="🌊" label={mainWaterUsesBma ? "คลองมอญ" : "ระดับน้ำใกล้พื้นที่"} value={mainWaterValue} note={mainWaterNote} source={mainWaterUsesBma ? "BMA" : "ThaiWater"} tone={mainWaterTone} />
          <KpiCard icon="🚗" label="น้ำท่วมถนน" value={roadValue} note={roadNote} source={roadUsesThaiWaterLabel(bma?.roadFlood ?? [])} tone={toneFromSeverity(roadSeverity)} />
          <KpiCard icon="☁️" label="โอกาสฝน กทม./ปริมณฑล" value={tmd?.rainChancePercent == null ? "—" : `${tmd.rainChancePercent}%`} note={tmd?.ok ? (tmd.summary || tmd.issuedAtRaw || "พยากรณ์รายวัน") : "TMD unavailable"} source="TMD" tone={tmdTone} />
          <KpiCard icon="🏞️" label="เจ้าพระยา C.29 บางไทร" value={fmt(rid?.flowM3s, "m³/s", 0)} note={rid?.ok ? `${trendLabel(rid.trend)} • ${rid.observedAtRaw || displayTime(rid.observedAt)}` : "RID unavailable"} source="RID" tone={ridTone} />
          <KpiCard icon="🌙" label="น้ำสูงรอบถัดไป" value={tide?.nextHigh ? `${tide.nextHigh.levelMslM.toFixed(2)} m` : "—"} note={tide?.nextHigh ? `${displayTimeRange(tide.nextHigh.startAt, tide.nextHigh.endAt)} • Bangkok Port` : (tide?.error || "Tide unavailable")} source="PREDICTION" tone={tideTone} />
        </div>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <div>
            <span className="section-kicker">WHAT TO WATCH</span>
            <h2>สิ่งที่ควรจับตา</h2>
          </div>
        </div>
        <div className="watch-grid">
          {watchItems.slice(0, 6).map((item, index) => (
            <article className={`watch-item dash-tone-${item.tone}`} key={`${item.title}-${index}`}>
              <span className="watch-icon" aria-hidden="true">{item.icon}</span>
              <div><strong>{item.title}</strong><p>{item.detail}</p></div>
            </article>
          ))}
          {!watchItems.length ? <div className="empty-state">ยังไม่พบประเด็นเด่นจากแหล่งข้อมูลที่พร้อมใช้งาน</div> : null}
        </div>
      </section>

      <section className="dash-section map-dashboard-card">
        <div className="dash-section-head">
          <div>
            <span className="section-kicker">MAP</span>
            <h2>แผนที่สถานการณ์</h2>
            <p>แสดงเฉพาะจุดข้อมูลที่ระบบกำลังใช้งานในรอบปัจจุบัน</p>
          </div>
          <span className="live-chip">MULTI-SOURCE</span>
        </div>
        <FloodMap points={mapPoints} />
        <p className="map-note">BMA เป็น primary source; เมื่อ BMA ใช้งานไม่ได้ จุดบางแห่งอาจมาจาก ThaiWater/สสน. และจะแสดงแหล่งที่มาในรายละเอียด ระบบไม่สร้างค่าจำลองทดแทนข้อมูลที่หาย</p>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <div>
            <span className="section-kicker">CROSS-CHECK</span>
            <h2>ตรวจสอบข้ามแหล่งข้อมูล</h2>
          </div>
        </div>
        <div className="cross-grid">
          <DetailMetric label="ThaiWater • ฝนใกล้บางกอกน้อย" value={fmt(twRain?.rain1h, "mm", 1)} note={twRain ? `${twRain.stationName} • ${twRain.distanceKm.toFixed(1)} กม. • 24 ชม. ${fmt(twRain.rain24h, "mm", 1)}` : "ยังไม่มีข้อมูล"} tone={toneFromSeverity(twRain?.severity ?? "UNKNOWN")} />
          <DetailMetric label="ThaiWater • ระดับน้ำใกล้พื้นที่" value={fmt(twWater?.levelMslM, "m MSL", 2)} note={twWater ? `${twWater.stationName}${twWater.stationCode ? ` (${twWater.stationCode})` : ""} • ${twWater.distanceKm.toFixed(1)} กม. • ไม่ใช่เซนเซอร์คลอง BMA เดิม` : "ยังไม่มีข้อมูล"} tone={toneFromSeverity(twWater?.severity ?? "UNKNOWN")} />
          <DetailMetric label="GISTDA • Flood layer" value={gistda?.intersectingFeatureCount == null ? "—" : `${gistda.intersectingFeatureCount} polygon`} note={gistda?.ok ? gistda.note : (gistda?.error || "GISTDA unavailable")} tone={(gistda?.intersectingFeatureCount ?? 0) > 0 ? "watch" : gistda?.ok ? "normal" : "offline"} />
        </div>
      </section>

      <section className="detail-stack">
        <details className="detail-disclosure" open>
          <summary><span>ระดับน้ำคลองและสถานีท้องถิ่น</span><small>แตะเพื่อย่อ/ขยาย</small></summary>
          <div className="detail-grid">
            <DetailMetric label="คลองมอญ" value={fmt(khlongMon?.levelInside, "ม.รทก.", 2)} note={sensorSubtitle(khlongMon)} tone={toneFromSeverity(khlongMon?.severity ?? "UNKNOWN")} />
            <DetailMetric label="คลองบางบำหรุ" value={fmt(bangBamru?.levelInside, "ม.รทก.", 2)} note={sensorSubtitle(bangBamru)} tone={toneFromSeverity(bangBamru?.severity ?? "UNKNOWN")} />
            <DetailMetric label="คลองบางกอกใหญ่" value={fmt(bangkokYai?.levelInside, "ม.รทก.", 2)} note={sensorSubtitle(bangkokYai)} tone={toneFromSeverity(bangkokYai?.severity ?? "UNKNOWN")} />
            <DetailMetric label="คลองสำเหร่" value={fmt(samre?.levelInside, "ม.รทก.", 2)} note={sensorSubtitle(samre)} tone={toneFromSeverity(samre?.severity ?? "UNKNOWN")} />
          </div>
        </details>

        <details className="detail-disclosure">
          <summary><span>สถานการณ์ถนน</span><small>{roadValue}</small></summary>
          <div className="road-list compact-road-list">
            {(bma?.roadFlood ?? []).map((road) => (
              <div className="road-row" key={road.code}>
                <div><strong>{road.name}</strong><span>{road.code} • {road.sourceStatus} • {road.observedAtRaw || "ไม่มีเวลาอัปเดต"}</span></div>
                <b>{road.depthCm == null ? "—" : `${road.depthCm.toFixed(1)} cm`}</b>
              </div>
            ))}
            {!loading && !(bma?.roadFlood.length) ? <div className="empty-state">ยังโหลดข้อมูลถนนไม่ได้</div> : null}
          </div>
        </details>

        {tide?.ok ? (
          <details className="detail-disclosure">
            <summary><span>ระดับน้ำทำนายรายชั่วโมง • Bangkok Port</span><small>PREDICTION</small></summary>
            <div className="tide-strip">{tide.today.map((point) => <div className="tide-hour" key={point.at}><span>{displayTime(point.at, false)}</span><strong>{point.levelMslM.toFixed(1)}</strong></div>)}</div>
            <p className="map-note">{tide.note}</p>
          </details>
        ) : null}

        <details className="detail-disclosure">
          <summary><span>สถานะแหล่งข้อมูลและลิงก์ต้นทาง</span><small>6 แหล่งหลัก</small></summary>
          <div className="source-health-list">
            <SourceDetail name="BMA DDS" state={bmaState} detail={bmaDirect ? "เชื่อมต่อโดยตรง" : "Cloud เข้า BMA direct ไม่ได้; ใช้ fallback ที่ระบุชัด"} />
            <SourceDetail name="ThaiWater / สสน." state={thaiWaterState} detail={thaiWater?.ok ? `${thaiWater.via === "direct" ? "Public API direct" : "GitHub relay cache"} • ฝน/ระดับน้ำ/ถนน` : "ยังดึงข้อมูลไม่ได้"} />
            <SourceDetail name="TMD" state={tmdState} detail="พยากรณ์กรุงเทพฯ/ปริมณฑล" />
            <SourceDetail name="RID C.29" state={ridState} detail="มวลน้ำเจ้าพระยาที่บางไทร" />
            <SourceDetail name="GISTDA" state={gistdaState} detail="ชั้นพื้นที่ประสบภัยน้ำท่วมเชิงพื้นที่" />
            <SourceDetail name="กรมอุทกศาสตร์" state={tideState} detail="Bangkok Port tide table • ค่าทำนาย" />
          </div>
          <div className="source-list source-links-v07">
            <a href="https://weather.bangkok.go.th/rain" target="_blank" rel="noreferrer">BMA Rain</a>
            <a href="https://weather.bangkok.go.th/Water/" target="_blank" rel="noreferrer">BMA Water</a>
            <a href={thaiWater?.sources.rain || "https://www.thaiwater.net/weather/rainfall"} target="_blank" rel="noreferrer">ThaiWater</a>
            <a href={tmd?.sourceUrl || "https://www.tmd.go.th/forecast/daily"} target="_blank" rel="noreferrer">TMD</a>
            <a href={rid?.sourceUrl || "https://www.rid.go.th/th/water-situation"} target="_blank" rel="noreferrer">RID</a>
            <a href={gistda?.sourceUrl || "https://gistdaportal.gistda.or.th"} target="_blank" rel="noreferrer">GISTDA</a>
            <a href={tide?.sourceUrl || "https://hydro.navy.mi.th/waterlaveltable"} target="_blank" rel="noreferrer">Tide Table</a>
          </div>
        </details>
      </section>
    </div>
  );
}

function roadUsesThaiWaterLabel(roads: Array<{ sourceStatus: string }>) {
  return roads.some((road) => isThaiWater(road.sourceStatus)) ? "ThaiWater relay" : "BMA";
}

function SourceDetail({ name, state, detail }: { name: string; state: SourceState; detail: string }) {
  return (
    <div className="source-detail-row">
      <div><strong>{name}</strong><span>{detail}</span></div>
      <HealthPill name="" state={state} />
    </div>
  );
}
