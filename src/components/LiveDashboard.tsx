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

function worstStatus(data: LiveOverview | null): Severity {
  if (!data?.bma) return "UNKNOWN";
  const all = [...data.bma.rain, ...data.bma.water, ...data.bma.roadFlood].map((s) => s.severity);
  return all.reduce<Severity>((worst, current) => rank[current] > rank[worst] ? current : worst, "NORMAL");
}

function isThaiWater(status: string | null | undefined) {
  return Boolean(status && /ThaiWater/.test(status));
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
    ? "ฝน 1 ชั่วโมง • สถานีใกล้บางกอกน้อย (ThaiWater)"
    : "ฝน 1 ชั่วโมง • บางกอกน้อย";
}

function waterTitle(station: WaterStation | undefined, place: string) {
  return isThaiWater(station?.sourceStatus)
    ? `ระดับน้ำใกล้${place} • ThaiWater`
    : place;
}

function sensorSubtitle(station: RainStation | WaterStation | undefined, fallback = "BMA DDS") {
  if (!station) return fallback;
  const time = station.observedAtRaw || "ไม่มีเวลาอัปเดต";
  if (isThaiWater(station.sourceStatus)) {
    return `${station.name} • ${station.sourceStatus} • ${time}`;
  }
  return `${station.code} • ${station.name} • ${station.sourceStatus} • ${time}`;
}

export default function LiveDashboard() {
  const [data, setData] = useState<LiveOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/overview/live", { cache: "no-store" });
      const body = (await response.json()) as LiveOverview;
      setData(body);
      setError(response.ok ? null : (body.errors?.join(" • ") || "โหลดข้อมูลไม่สำเร็จ"));
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
  const fallbackActive = Boolean(
    bma && [...bma.rain, ...bma.water, ...bma.roadFlood].some((s) => isThaiWater(s.sourceStatus)),
  );
  const fallbackCritical = Boolean(
    fallbackActive && bma?.water.some((s) => s.severity === "CRITICAL"),
  );
  const status: Severity = fallbackActive ? "OFFLINE" : worstStatus(data);
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

  const tmdTone: "normal" | "watch" | "warning" = tmd?.heavyRain ? "warning" : (tmd?.rainChancePercent ?? 0) >= 60 ? "watch" : "normal";
  const ridFreshness = rid?.stale ? " • ข้อมูลเก่า/ควรตรวจต้นทาง" : "";

  return (
    <>
      <header className="hero">
        <div>
          <div className="eyebrow">BANGKOK • MULTI-SOURCE FLOOD CONTEXT V0.5</div>
          <h1>Thonburi Flood Watch</h1>
          <p>บางกอกน้อย • ธนบุรี • บางกอกใหญ่</p>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="freshness">
        {loading ? "กำลังดึงข้อมูลจากแหล่งข้อมูลทางการ…" : data ? `รวมข้อมูลล่าสุด ${displayTime(data.generatedAt)} • หน้าเว็บรีเฟรชทุก 5 นาที` : "ยังไม่มีข้อมูล"}
      </div>

      {fallbackActive ? (
        <div className="source-warning">
          ⚠️ BMA direct feed ติดต่อจาก Cloud ไม่ได้ในขณะนี้ • ระบบใช้ข้อมูลตรวจวัด ThaiWater/สสน. จากสถานีใกล้เคียงเป็น fallback และระบุแหล่งที่มาบนแต่ละการ์ด • ค่าระดับน้ำ fallback ไม่ใช่ค่าจากเซนเซอร์ BMA เดิม
        </div>
      ) : null}

      {fallbackCritical ? (
        <section className="forecast-alert">
          <strong>⚠️ ThaiWater nearby water-level context</strong>
          <span>สถานีตรวจวัดใกล้พื้นที่อย่างน้อยหนึ่งแห่งมีสถานะระดับสูงจากต้นทาง ThaiWater โปรดใช้เป็นข้อมูลบริบทและตรวจประกาศทางการก่อนตัดสินใจด้านความปลอดภัย</span>
        </section>
      ) : null}

      {error ? <div className="source-warning">⚠️ {error} — ระบบจะไม่สร้างค่าจำลองทดแทนแหล่งข้อมูลที่ล้มเหลว</div> : null}

      {tmd?.ok && (tmd.heavyRain || tmd.gustyWind) ? (
        <section className="forecast-alert">
          <strong>⚠️ TMD Bangkok forecast</strong>
          <span>{tmd.summary || "มีสัญญาณฝน/ลมที่ควรติดตาม"}</span>
        </section>
      ) : null}

      <section className="grid">
        <MetricCard
          title={rainTitle(maxRain)}
          value={maxRain ? fmt(maxRain.rain1h, "mm", 1) : "—"}
          subtitle={sensorSubtitle(maxRain)}
          tone={tone(maxRain?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title={waterTitle(khlongMon, "คลองมอญ")}
          value={fmt(khlongMon?.levelInside, "ม.รทก.", 2)}
          subtitle={sensorSubtitle(khlongMon)}
          tone={tone(khlongMon?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title={waterTitle(bangBamru, "คลองบางบำหรุ")}
          value={fmt(bangBamru?.levelInside, "ม.รทก.", 2)}
          subtitle={sensorSubtitle(bangBamru)}
          tone={tone(bangBamru?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title={waterTitle(bangkokYai, "คลองบางกอกใหญ่")}
          value={fmt(bangkokYai?.levelInside, "ม.รทก.", 2)}
          subtitle={sensorSubtitle(bangkokYai)}
          tone={tone(bangkokYai?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title={waterTitle(samre, "คลองสำเหร่")}
          value={fmt(samre?.levelInside, "ม.รทก.", 2)}
          subtitle={sensorSubtitle(samre)}
          tone={tone(samre?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title="คลองมอญ • ด้านนอก"
          value={fmt(khlongMon?.levelOutside, "ม.รทก.", 2)}
          subtitle={isThaiWater(khlongMon?.sourceStatus) ? "ThaiWater fallback ไม่มีค่าด้านนอกของสถานี BMA เดิม" : "ค่าด้านนอกสถานีตามตาราง BMA DDS"}
          tone={tone(khlongMon?.severity ?? "UNKNOWN")}
        />
      </section>

      <section className="context-grid">
        <MetricCard
          title="TMD • โอกาสฝน กทม./ปริมณฑล"
          value={tmd?.rainChancePercent == null ? "—" : `${tmd.rainChancePercent}%`}
          subtitle={tmd?.ok ? `${tmd.heavyRain ? "มีข้อความฝนตกหนัก • " : ""}${tmd.gustyWind ? "มีลมกระโชกแรง • " : ""}${tmd.issuedAtRaw || "พยากรณ์รายวัน"}` : "TMD unavailable"}
          tone={tmdTone}
        />
        <MetricCard
          title="RID C.29 • บางไทร"
          value={fmt(rid?.flowM3s, "m³/s", 0)}
          subtitle={rid?.ok ? `${trendLabel(rid.trend)}${rid.changePercent == null ? "" : ` (${rid.changePercent > 0 ? "+" : ""}${rid.changePercent.toFixed(1)}%)`} • ${rid.observedAtRaw || displayTime(rid.observedAt)}${ridFreshness}` : "RID unavailable"}
          tone={rid?.stale ? "watch" : "normal"}
        />
        <MetricCard
          title="น้ำขึ้น-ลง • Bangkok Port"
          value={tide?.nextHigh ? `${tide.nextHigh.levelMslM.toFixed(2)} m MSL` : "—"}
          subtitle={tide?.nextHigh ? `รอบสูงถัดไป ${displayTimeRange(tide.nextHigh.startAt, tide.nextHigh.endAt)} • ค่าทำนาย ไม่ใช่เซนเซอร์สด` : (tide?.error || "ตารางน้ำขึ้นลง")}
          tone="normal"
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{roadUsesThaiWater ? "สถานการณ์ถนน • ThaiWater relay เซนเซอร์ กทม." : "สถานการณ์ถนน • เซนเซอร์จริง กทม."}</h2>
            <p>{roadUsesThaiWater ? "บางกอกน้อย — relay ของเซนเซอร์ถนน กทม.; เวลาอัปเดตและสถานะ stale แสดงตามต้นทาง" : "บางกอกน้อย — ใช้ค่าที่ BMA DDS เผยแพร่โดยตรง"}</p>
          </div>
        </div>
        <div className="road-list">
          {(bma?.roadFlood ?? []).map((road) => (
            <div className="road-row" key={road.code}>
              <div>
                <strong>{road.name}</strong>
                <span>{road.code} • {road.sourceStatus} • {road.observedAtRaw || "ไม่มีเวลาอัปเดต"}</span>
              </div>
              <b>{road.depthCm == null ? "—" : `${road.depthCm.toFixed(1)} cm`}</b>
            </div>
          ))}
          {!loading && !(bma?.roadFlood.length) ? <div className="empty-state">ยังโหลดข้อมูลถนนไม่ได้</div> : null}
        </div>
      </section>

      {tide?.ok ? (
        <section className="panel tide-panel">
          <div className="panel-head">
            <div>
              <h2>ระดับน้ำทำนายรายชั่วโมง • วันนี้</h2>
              <p>Bangkok Port • เมตรเหนือ Mean Sea Level (MSL) • กรมอุทกศาสตร์</p>
            </div>
            <span className="prediction-chip">PREDICTION</span>
          </div>
          <div className="tide-strip">
            {tide.today.map((p) => (
              <div className="tide-hour" key={p.at}>
                <span>{displayTime(p.at, false)}</span>
                <strong>{p.levelMslM.toFixed(1)}</strong>
              </div>
            ))}
          </div>
          <p className="map-note">{tide.note}</p>
        </section>
      ) : null}

      <section className="panel map-panel">
        <div className="panel-head">
          <div>
            <h2>{fallbackActive ? "แผนที่สถานีตรวจวัดและสถานี fallback" : "แผนที่สถานีจริง"}</h2>
            <p>{fallbackActive ? "พิกัดจริงของสถานีที่กำลังใช้ • BMA เมื่อเข้าถึงได้ + ThaiWater fallback" : "พิกัดสถานี BMA DDS • ฝน + ระดับน้ำ + น้ำท่วมถนน"}</p>
          </div>
          <span className="live-chip">NEAR REAL-TIME</span>
        </div>
        <FloodMap points={mapPoints} />
        <p className="map-note">
          {fallbackActive
            ? "เมื่อ BMA direct feed ติดต่อจาก Cloud ไม่ได้ ระบบใช้สถานีตรวจวัดใกล้เคียงจาก ThaiWater/สสน. โดยแสดงชื่อ พิกัด เวลา และสถานะ fallback อย่างชัดเจน; ข้อมูลเก่าจะถูกทำเครื่องหมายแทนการสร้างค่าใหม่"
            : "หมุดทั้งหมดเป็นพิกัดสถานีของสำนักการระบายน้ำ กทม. ส่วน TMD, RID C.29 และน้ำขึ้นลงเป็นข้อมูลบริบทภายนอกแผนที่; หากต้นทางขัดข้อง ระบบแสดง unavailable/stale แทนการสร้างค่าเอง"}
        </p>
      </section>

      <section className="panel source-panel">
        <div className="panel-head">
          <div>
            <h2>แหล่งข้อมูล</h2>
            <p>แยกข้อมูลตรวจวัดจริง ข้อมูล fallback และข้อมูลพยากรณ์อย่างชัดเจน</p>
          </div>
        </div>
        <div className="source-list">
          <a href="https://weather.bangkok.go.th/rain" target="_blank" rel="noreferrer">BMA Rain</a>
          <a href="https://weather.bangkok.go.th/Water/" target="_blank" rel="noreferrer">BMA Water Level</a>
          <a href="https://weather.bangkok.go.th/floodbangkok" target="_blank" rel="noreferrer">BMA Road Flood</a>
          <a href="https://www.thaiwater.net/" target="_blank" rel="noreferrer">ThaiWater / HII Fallback</a>
          <a href={tmd?.sourceUrl || "https://www.tmd.go.th/forecast/daily"} target="_blank" rel="noreferrer">TMD Forecast</a>
          <a href={rid?.sourceUrl || "https://www.rid.go.th/th/water-situation"} target="_blank" rel="noreferrer">RID C.29 Report</a>
          <a href={tide?.sourceUrl || "https://hydro.navy.mi.th/waterlaveltable"} target="_blank" rel="noreferrer">Hydrographic Tide Table</a>
        </div>
      </section>
    </>
  );
}
