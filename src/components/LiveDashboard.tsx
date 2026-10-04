"use client";

import { useEffect, useMemo, useState } from "react";
import FloodMap from "@/components/FloodMap";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import { buildFloodMapPoints } from "@/lib/map-points";
import type { Severity, RainStation, WaterStation } from "@/lib/bma/types";
import type { LiveOverview } from "@/lib/overview/types";

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
  const stations = [...data.bma.rain, ...data.bma.water, ...data.bma.roadFlood];
  const fallbackActive = stations.some((s) => isThaiWater(s.sourceStatus));
  const direct = stations.filter((s) => !isThaiWater(s.sourceStatus));
  if (!direct.length && fallbackActive) return "OFFLINE";
  if (!direct.length) return "UNKNOWN";
  return direct.map((s) => s.severity)
    .reduce<Severity>((worst, current) => rank[current] > rank[worst] ? current : worst, "NORMAL");
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

function tone(status: Severity): "normal" | "watch" | "warning" | "critical" {
  if (status === "CRITICAL") return "critical";
  if (status === "WARNING") return "warning";
  if (status === "WATCH" || status === "OFFLINE") return "watch";
  return "normal";
}

function trendLabel(trend: string) {
  if (trend === "RISING") return "↑ เพิ่มขึ้น";
  if (trend === "FALLING") return "↓ ลดลง";
  if (trend === "STABLE") return "→ ทรงตัว";
  return "ไม่ทราบแนวโน้ม";
}

function rainTitle(station: RainStation | undefined) {
  return isThaiWater(station?.sourceStatus)
    ? "ฝน • สถานีใกล้บางกอกน้อย (fallback)"
    : "ฝน 1 ชั่วโมง • บางกอกน้อย";
}

function waterTitle(station: WaterStation | undefined, place: string) {
  return isThaiWater(station?.sourceStatus)
    ? `บริบทระดับน้ำใกล้${place} • fallback`
    : place;
}

function sensorSubtitle(station: RainStation | WaterStation | undefined, fallback = "BMA DDS") {
  if (!station) return fallback;
  const time = station.observedAtRaw || "ไม่มีเวลาอัปเดต";
  if (isThaiWater(station.sourceStatus)) return `${station.name} • ${station.sourceStatus} • ${time}`;
  return `${station.code} • ${station.name} • ${station.sourceStatus} • ${time}`;
}

function SourceRow({ name, state, detail }: { name: string; state: string; detail: string }) {
  return (
    <div className="road-row">
      <div>
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>
      <b>{state}</b>
    </div>
  );
}

export default function LiveDashboard() {
  const [data, setData] = useState<LiveOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
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
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const bma = data?.bma;
  const thaiWater = data?.thaiWater;
  const gistda = data?.gistda;
  const fallbackActive = Boolean(
    bma && [...bma.rain, ...bma.water, ...bma.roadFlood].some((s) => isThaiWater(s.sourceStatus)),
  );
  const status = worstLocalStatus(data);
  const mapPoints = useMemo(() => bma ? buildFloodMapPoints(bma) : [], [bma]);

  const bknRain = bma?.rain.filter((s) => s.district === "บางกอกน้อย") ?? [];
  const maxRain = bknRain.length
    ? bknRain.reduce((best, s) => ((s.rain1h ?? -1) > (best.rain1h ?? -1) ? s : best))
    : undefined;
  const khlongMon = bma?.water.find((s) => s.code === "WL.KMN.01");
  const bangBamru = bma?.water.find((s) => s.code === "WL.BBR.01");
  const bangkokYai = bma?.water.find((s) => s.code === "WL.BKY.01");
  const samre = bma?.water.find((s) => s.code === "WL.SRE.01");
  const roadUsesThaiWater = Boolean(bma?.roadFlood.some((s) => isThaiWater(s.sourceStatus)));
  const tmd = data?.tmd;
  const rid = data?.ridC29;
  const tide = data?.tide;
  const twRain = thaiWater?.rain;
  const twWater = thaiWater?.water[0];

  const tmdTone: "normal" | "watch" | "warning" = tmd?.heavyRain ? "warning" : (tmd?.rainChancePercent ?? 0) >= 60 ? "watch" : "normal";
  const ridFreshness = rid?.stale ? " • ข้อมูลเก่า/ควรตรวจต้นทาง" : "";
  const bmaDirect = Boolean(bma && !fallbackActive && Object.values(bma.sources).some((url) => /bangkok\.go\.th/.test(url)));

  return (
    <>
      <header className="hero">
        <div>
          <div className="eyebrow">BANGKOK • MULTI-SOURCE FLOOD CONTEXT V0.6</div>
          <h1>Thonburi Flood Watch</h1>
          <p>บางกอกน้อย • ธนบุรี • บางกอกใหญ่</p>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="freshness">
        {loading ? "กำลังรวมข้อมูล BMA • ThaiWater • TMD • RID • GISTDA • กรมอุทกศาสตร์…" : data ? `รวมข้อมูลล่าสุด ${displayTime(data.generatedAt)} • หน้าเว็บรีเฟรชทุก 5 นาที` : "ยังไม่มีข้อมูล"}
      </div>

      {fallbackActive ? (
        <div className="source-warning">
          ⚠️ BMA direct feed ยังติดต่อจาก Cloud ไม่ได้ • ข้อมูลท้องถิ่นบางรายการใช้ ThaiWater/สสน. หรือ GitHub relay เป็น fallback และระบุที่มาบนการ์ดอย่างชัดเจน • ระบบไม่ถือค่าสถานีใกล้เคียงว่าเป็นเซนเซอร์คลอง BMA จุดเดิม
        </div>
      ) : null}

      {data?.degraded && data.errors.length ? (
        <div className="source-warning">⚠️ ระบบทำงานแบบ Multi-Source แต่มีบางแหล่ง degraded/stale: {data.errors.slice(0, 3).join(" • ")}</div>
      ) : null}

      {error ? <div className="source-warning">⚠️ {error}</div> : null}

      {tmd?.ok && (tmd.heavyRain || tmd.gustyWind) ? (
        <section className="forecast-alert">
          <strong>⚠️ TMD Bangkok forecast</strong>
          <span>{tmd.summary || "มีสัญญาณฝน/ลมที่ควรติดตาม"}</span>
        </section>
      ) : null}

      <section className="grid">
        <MetricCard title={rainTitle(maxRain)} value={maxRain ? fmt(maxRain.rain1h, "mm", 1) : "—"} subtitle={sensorSubtitle(maxRain)} tone={tone(maxRain?.severity ?? "UNKNOWN")} />
        <MetricCard title={waterTitle(khlongMon, "คลองมอญ")} value={fmt(khlongMon?.levelInside, "ม.รทก.", 2)} subtitle={sensorSubtitle(khlongMon)} tone={tone(khlongMon?.severity ?? "UNKNOWN")} />
        <MetricCard title={waterTitle(bangBamru, "คลองบางบำหรุ")} value={fmt(bangBamru?.levelInside, "ม.รทก.", 2)} subtitle={sensorSubtitle(bangBamru)} tone={tone(bangBamru?.severity ?? "UNKNOWN")} />
        <MetricCard title={waterTitle(bangkokYai, "คลองบางกอกใหญ่")} value={fmt(bangkokYai?.levelInside, "ม.รทก.", 2)} subtitle={sensorSubtitle(bangkokYai)} tone={tone(bangkokYai?.severity ?? "UNKNOWN")} />
        <MetricCard title={waterTitle(samre, "คลองสำเหร่")} value={fmt(samre?.levelInside, "ม.รทก.", 2)} subtitle={sensorSubtitle(samre)} tone={tone(samre?.severity ?? "UNKNOWN")} />
        <MetricCard title="คลองมอญ • ด้านนอก" value={fmt(khlongMon?.levelOutside, "ม.รทก.", 2)} subtitle={isThaiWater(khlongMon?.sourceStatus) ? "fallback ไม่มีค่าด้านนอกของเซนเซอร์ BMA เดิม" : "ค่าด้านนอกสถานีตาม BMA DDS"} tone={tone(khlongMon?.severity ?? "UNKNOWN")} />
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Cross-check อิสระจาก BMA</h2><p>ThaiWater/สสน. + GISTDA ใช้ยืนยันบริบท ไม่สวมรอยเป็นเซนเซอร์ BMA</p></div></div>
        <section className="context-grid">
          <MetricCard title="ThaiWater • ฝน 1 ชม. ใกล้บางกอกน้อย" value={fmt(twRain?.rain1h, "mm", 1)} subtitle={twRain ? `${twRain.stationName} • ${twRain.distanceKm.toFixed(1)} กม. • ${twRain.observedAtRaw || displayTime(twRain.observedAt)}` : "ThaiWater unavailable"} tone={tone(twRain?.severity ?? "UNKNOWN")} />
          <MetricCard title="ThaiWater • ระดับน้ำสถานีใกล้เคียง" value={fmt(twWater?.levelMslM, "m MSL", 2)} subtitle={twWater ? `${twWater.stationName}${twWater.stationCode ? ` (${twWater.stationCode})` : ""} • ${twWater.distanceKm.toFixed(1)} กม. • ไม่ใช่เซนเซอร์คลอง BMA เดิม` : "ThaiWater unavailable"} tone={tone(twWater?.severity ?? "UNKNOWN")} />
          <MetricCard title="GISTDA • พื้นที่ประสบภัยน้ำท่วม" value={gistda?.intersectingFeatureCount == null ? "—" : `${gistda.intersectingFeatureCount} polygon`} subtitle={gistda?.ok ? gistda.note : (gistda?.error || "GISTDA unavailable")} tone={(gistda?.intersectingFeatureCount ?? 0) > 0 ? "watch" : "normal"} />
        </section>
      </section>

      <section className="context-grid">
        <MetricCard title="TMD • โอกาสฝน กทม./ปริมณฑล" value={tmd?.rainChancePercent == null ? "—" : `${tmd.rainChancePercent}%`} subtitle={tmd?.ok ? `${tmd.heavyRain ? "มีข้อความฝนตกหนัก • " : ""}${tmd.gustyWind ? "มีลมกระโชกแรง • " : ""}${tmd.issuedAtRaw || "พยากรณ์รายวัน"}` : "TMD unavailable"} tone={tmdTone} />
        <MetricCard title="RID C.29 • บางไทร" value={fmt(rid?.flowM3s, "m³/s", 0)} subtitle={rid?.ok ? `${trendLabel(rid.trend)}${rid.changePercent == null ? "" : ` (${rid.changePercent > 0 ? "+" : ""}${rid.changePercent.toFixed(1)}%)`} • ${rid.observedAtRaw || displayTime(rid.observedAt)}${ridFreshness}` : "RID unavailable"} tone={rid?.stale ? "watch" : "normal"} />
        <MetricCard title="น้ำขึ้น-ลง • Bangkok Port" value={tide?.nextHigh ? `${tide.nextHigh.levelMslM.toFixed(2)} m MSL` : "—"} subtitle={tide?.nextHigh ? `รอบสูงถัดไป ${displayTimeRange(tide.nextHigh.startAt, tide.nextHigh.endAt)} • ค่าทำนาย ไม่ใช่เซนเซอร์สด` : (tide?.error || "ตารางน้ำขึ้นลง")} tone="normal" />
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>สถานะแหล่งข้อมูล</h2><p>แยกแหล่งสด แหล่ง fallback ข้อมูลเก่า และข้อมูลพยากรณ์</p></div></div>
        <div className="road-list">
          <SourceRow name="BMA DDS" state={bmaDirect ? "LIVE" : "FALLBACK"} detail={bmaDirect ? "เชื่อมต่อ BMA โดยตรง" : "Cloud เข้า BMA direct ไม่ได้; ใช้แหล่งสำรองที่ระบุชัด"} />
          <SourceRow name="ThaiWater / สสน." state={thaiWater?.ok ? "LIVE" : "OFFLINE"} detail={thaiWater?.ok ? `${thaiWater.via === "direct" ? "Public API direct" : "GitHub relay cache"} • ฝน/ระดับน้ำ/ถนน` : "ยังดึงข้อมูลไม่ได้"} />
          <SourceRow name="TMD" state={tmd?.ok ? "LIVE" : "OFFLINE"} detail="พยากรณ์อากาศกรุงเทพฯ/ปริมณฑล" />
          <SourceRow name="RID C.29" state={rid?.ok ? (rid.stale ? "STALE" : "LIVE") : "OFFLINE"} detail="มวลน้ำเจ้าพระยาที่บางไทร" />
          <SourceRow name="GISTDA" state={gistda?.ok ? "LIVE" : "OFFLINE"} detail="ชั้นข้อมูลพื้นที่ประสบภัยน้ำท่วมเชิงพื้นที่" />
          <SourceRow name="กรมอุทกศาสตร์" state={tide?.ok ? "PREDICT" : "OFFLINE"} detail="ตารางน้ำขึ้นลง Bangkok Port; เป็นค่าทำนาย" />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>{roadUsesThaiWater ? "สถานการณ์ถนน • ThaiWater relay เซนเซอร์ กทม." : "สถานการณ์ถนน • เซนเซอร์จริง กทม."}</h2><p>{roadUsesThaiWater ? "บางกอกน้อย — relay ของเซนเซอร์ถนน กทม.; ถ้าข้อมูลเก่าจะแสดง stale/offline" : "บางกอกน้อย — ใช้ค่าที่ BMA DDS เผยแพร่โดยตรง"}</p></div></div>
        <div className="road-list">
          {(bma?.roadFlood ?? []).map((road) => (
            <div className="road-row" key={road.code}><div><strong>{road.name}</strong><span>{road.code} • {road.sourceStatus} • {road.observedAtRaw || "ไม่มีเวลาอัปเดต"}</span></div><b>{road.depthCm == null ? "—" : `${road.depthCm.toFixed(1)} cm`}</b></div>
          ))}
          {!loading && !(bma?.roadFlood.length) ? <div className="empty-state">ยังโหลดข้อมูลถนนไม่ได้</div> : null}
        </div>
      </section>

      {tide?.ok ? (
        <section className="panel tide-panel">
          <div className="panel-head"><div><h2>ระดับน้ำทำนายรายชั่วโมง • วันนี้</h2><p>Bangkok Port • เมตรเหนือ Mean Sea Level (MSL) • กรมอุทกศาสตร์</p></div><span className="prediction-chip">PREDICTION</span></div>
          <div className="tide-strip">{tide.today.map((p) => <div className="tide-hour" key={p.at}><span>{displayTime(p.at, false)}</span><strong>{p.levelMslM.toFixed(1)}</strong></div>)}</div>
          <p className="map-note">{tide.note}</p>
        </section>
      ) : null}

      <section className="panel map-panel">
        <div className="panel-head"><div><h2>แผนที่สถานีที่กำลังใช้</h2><p>BMA เป็น primary; เมื่อ BMA ขัดข้องหมุดบางจุดอาจเป็น ThaiWater fallback และจะแสดงที่มาใน popup</p></div><span className="live-chip">MULTI-SOURCE</span></div>
        <FloodMap points={mapPoints} />
        <p className="map-note">แผนที่แสดงพิกัดของข้อมูลที่ระบบกำลังใช้งานจริงในรอบนั้น ไม่ถือสถานีใกล้เคียงเป็นสถานี BMA จุดเดิม และไม่สร้างค่าจำลองเมื่อแหล่งข้อมูลขัดข้อง</p>
      </section>

      <section className="panel source-panel">
        <div className="panel-head"><div><h2>แหล่งข้อมูล</h2><p>แหล่งข้อมูลทางการ/สาธารณะที่ใช้ใน V0.6</p></div></div>
        <div className="source-list">
          <a href="https://weather.bangkok.go.th/rain" target="_blank" rel="noreferrer">BMA Rain</a>
          <a href="https://weather.bangkok.go.th/Water/" target="_blank" rel="noreferrer">BMA Water Level</a>
          <a href={thaiWater?.sources.rain || "https://www.thaiwater.net/weather/rainfall"} target="_blank" rel="noreferrer">ThaiWater / สสน.</a>
          <a href={tmd?.sourceUrl || "https://www.tmd.go.th/forecast/daily"} target="_blank" rel="noreferrer">TMD Forecast</a>
          <a href={rid?.sourceUrl || "https://www.rid.go.th/th/water-situation"} target="_blank" rel="noreferrer">RID C.29 Report</a>
          <a href={gistda?.sourceUrl || "https://gistdaportal.gistda.or.th"} target="_blank" rel="noreferrer">GISTDA Flood Layer</a>
          <a href={tide?.sourceUrl || "https://hydro.navy.mi.th/waterlaveltable"} target="_blank" rel="noreferrer">Hydrographic Tide Table</a>
        </div>
      </section>
    </>
  );
}
