"use client";

import { useEffect, useMemo, useState } from "react";
import FloodMap from "@/components/FloodMap";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import { buildFloodMapPoints } from "@/lib/map-points";
import type { Severity } from "@/lib/bma/types";
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

  const status = worstStatus(data);
  const bma = data?.bma;
  const mapPoints = useMemo(() => bma ? buildFloodMapPoints(bma) : [], [bma]);

  const bknRain = bma?.rain.filter((s) => s.district === "บางกอกน้อย") ?? [];
  const maxRain = bknRain.length
    ? bknRain.reduce((best, s) => ((s.rain1h ?? -1) > (best.rain1h ?? -1) ? s : best))
    : undefined;
  const khlongMon = bma?.water.find((s) => s.code === "WL.KMN.01");
  const bangBamru = bma?.water.find((s) => s.code === "WL.BBR.01");
  const bangkokYai = bma?.water.find((s) => s.code === "WL.BKY.01");
  const samre = bma?.water.find((s) => s.code === "WL.SRE.01");
  const tmd = data?.tmd;
  const rid = data?.ridC29;
  const tide = data?.tide;

  const tmdTone: "normal" | "watch" | "warning" = tmd?.heavyRain ? "warning" : (tmd?.rainChancePercent ?? 0) >= 60 ? "watch" : "normal";
  const ridFreshness = rid?.stale ? " • ข้อมูลเก่า/ควรตรวจต้นทาง" : "";

  return (
    <>
      <header className="hero">
        <div>
          <div className="eyebrow">BANGKOK • MULTI-SOURCE FLOOD CONTEXT V0.3</div>
          <h1>Thonburi Flood Watch</h1>
          <p>บางกอกน้อย • ธนบุรี • บางกอกใหญ่</p>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="freshness">
        {loading ? "กำลังดึงข้อมูลจาก BMA • TMD • RID และตารางน้ำขึ้นลง…" : data ? `รวมข้อมูลล่าสุด ${displayTime(data.generatedAt)} • หน้าเว็บรีเฟรชทุก 5 นาที` : "ยังไม่มีข้อมูล"}
      </div>

      {error ? <div className="source-warning">⚠️ {error} — ระบบจะไม่สร้างค่าจำลองทดแทนแหล่งข้อมูลที่ล้มเหลว</div> : null}

      {tmd?.ok && (tmd.heavyRain || tmd.gustyWind) ? (
        <section className="forecast-alert">
          <strong>⚠️ TMD Bangkok forecast</strong>
          <span>{tmd.summary || "มีสัญญาณฝน/ลมที่ควรติดตาม"}</span>
        </section>
      ) : null}

      <section className="grid">
        <MetricCard
          title="ฝน 1 ชั่วโมง • บางกอกน้อย"
          value={maxRain ? fmt(maxRain.rain1h, "mm", 1) : "—"}
          subtitle={maxRain ? `${maxRain.code} • ${maxRain.name} • ${maxRain.observedAtRaw}` : "BMA DDS"}
          tone={tone(maxRain?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title="คลองมอญ • ด้านใน"
          value={fmt(khlongMon?.levelInside, "ม.รทก.", 2)}
          subtitle={khlongMon ? `${khlongMon.code} • ${khlongMon.sourceStatus} • ${khlongMon.observedAtRaw}` : "BMA DDS"}
          tone={tone(khlongMon?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title="คลองบางบำหรุ"
          value={fmt(bangBamru?.levelInside, "ม.รทก.", 2)}
          subtitle={bangBamru ? `${bangBamru.code} • ${bangBamru.observedAtRaw}` : "BMA DDS"}
          tone={tone(bangBamru?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title="คลองบางกอกใหญ่"
          value={fmt(bangkokYai?.levelInside, "ม.รทก.", 2)}
          subtitle={bangkokYai ? `${bangkokYai.code} • ${bangkokYai.observedAtRaw}` : "BMA DDS"}
          tone={tone(bangkokYai?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title="คลองสำเหร่"
          value={fmt(samre?.levelInside, "ม.รทก.", 2)}
          subtitle={samre ? `${samre.code} • ${samre.observedAtRaw}` : "BMA DDS"}
          tone={tone(samre?.severity ?? "UNKNOWN")}
        />
        <MetricCard
          title="คลองมอญ • ด้านนอก"
          value={fmt(khlongMon?.levelOutside, "ม.รทก.", 2)}
          subtitle="ค่าด้านนอกสถานีตามตาราง BMA DDS"
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
            <h2>สถานการณ์ถนน • เซนเซอร์จริง กทม.</h2>
            <p>บางกอกน้อย — ใช้ค่าที่ BMA DDS เผยแพร่โดยตรง</p>
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
            <h2>แผนที่สถานีจริง</h2>
            <p>พิกัดสถานี BMA DDS • ฝน + ระดับน้ำ + น้ำท่วมถนน</p>
          </div>
          <span className="live-chip">NEAR REAL-TIME</span>
        </div>
        <FloodMap points={mapPoints} />
        <p className="map-note">
          หมุดทั้งหมดเป็นพิกัดสถานีของสำนักการระบายน้ำ กทม. ส่วน TMD, RID C.29 และน้ำขึ้นลงเป็นข้อมูลบริบทภายนอกแผนที่ใน V0.3; หากต้นทางขัดข้อง ระบบแสดงสถานะ unavailable/stale แทนการสร้างค่าเอง
        </p>
      </section>

      <section className="panel source-panel">
        <div className="panel-head">
          <div>
            <h2>แหล่งข้อมูล</h2>
            <p>แยกข้อมูลตรวจวัดจริงออกจากข้อมูลพยากรณ์อย่างชัดเจน</p>
          </div>
        </div>
        <div className="source-list">
          <a href="https://weather.bangkok.go.th/rain" target="_blank" rel="noreferrer">BMA Rain</a>
          <a href="https://weather.bangkok.go.th/Water/" target="_blank" rel="noreferrer">BMA Water Level</a>
          <a href="https://weather.bangkok.go.th/floodbangkok" target="_blank" rel="noreferrer">BMA Road Flood</a>
          <a href={tmd?.sourceUrl || "https://www.tmd.go.th/forecast/daily"} target="_blank" rel="noreferrer">TMD Forecast</a>
          <a href={rid?.sourceUrl || "https://www.rid.go.th/th/water-situation"} target="_blank" rel="noreferrer">RID C.29 Report</a>
          <a href={tide?.sourceUrl || "https://hydro.navy.mi.th/waterlaveltable"} target="_blank" rel="noreferrer">Hydrographic Tide Table</a>
        </div>
      </section>
    </>
  );
}
