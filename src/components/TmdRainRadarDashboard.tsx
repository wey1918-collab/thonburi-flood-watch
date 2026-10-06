"use client";

import { useEffect, useState } from "react";
import type { LiveOverview } from "@/lib/overview/types";
import type { TmdBangkokForecast } from "@/lib/tmd/types";
import styles from "./TmdRainRadarDashboard.module.css";

type FiveLevel = 0 | 1 | 2 | 3 | 4 | 5;

function chanceLevel(value: number | null | undefined, heavyRain: boolean): FiveLevel {
  if (value == null) return 0;
  let level: FiveLevel = value <= 20 ? 1 : value <= 40 ? 2 : value <= 60 ? 3 : value <= 80 ? 4 : 5;
  if (heavyRain && level < 4) level = 4;
  return level;
}

function rainLevel(value: number | null | undefined): FiveLevel {
  if (value == null) return 0;
  if (value <= 10) return 1;
  if (value <= 35) return 2;
  if (value <= 60) return 3;
  if (value <= 90) return 4;
  return 5;
}

function levelText(level: FiveLevel) {
  if (level === 1) return "ระดับ 1 • ต่ำ";
  if (level === 2) return "ระดับ 2 • เฝ้าระวัง";
  if (level === 3) return "ระดับ 3 • ปานกลาง";
  if (level === 4) return "ระดับ 4 • สูง";
  if (level === 5) return "ระดับ 5 • สูงมาก";
  return "ยังไม่มีค่าที่ใช้จัดระดับ";
}

function Scale({ level }: { level: FiveLevel }) {
  return (
    <div className={styles.scale} aria-label="มาตรวัดห้าระดับ">
      {[1, 2, 3, 4, 5].map((item) => (
        <span key={item} className={level === item ? styles.active : ""}>{item}</span>
      ))}
    </div>
  );
}

function SourceCard({ icon, label, value, state, note }: {
  icon: string;
  label: string;
  value: string;
  state: "ONLINE" | "OFFLINE" | "DATA";
  note: string;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <span className={styles.icon} aria-hidden="true">{icon}</span>
        <span className={styles.source}>TMD • {state}</span>
      </div>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      <div className={`${styles.levelLabel} ${state === "OFFLINE" ? styles.offline : styles.online}`}>{state}</div>
      <p>{note}</p>
    </article>
  );
}

export default function TmdRainRadarDashboard() {
  const [tmd, setTmd] = useState<TmdBangkokForecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/overview/live");
        const body = (await response.json()) as LiveOverview;
        if (!response.ok) throw new Error(body.errors?.join(" • ") || "โหลดข้อมูล TMD ไม่สำเร็จ");
        if (active) {
          setTmd(body.tmd);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูล TMD ไม่สำเร็จ");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const forecastLevel = chanceLevel(tmd?.rainChancePercent, Boolean(tmd?.heavyRain));
  const awsLevel = rainLevel(tmd?.aws.rain1hMm);
  const radarState = tmd?.radar.ok ? "ONLINE" : "OFFLINE";
  const nowcastState = tmd?.nowcast.ok ? "ONLINE" : "OFFLINE";

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>TMD RAIN & RADAR • V1.0</div>
          <h2>กรมอุตุนิยมวิทยา • ฝนกรุงเทพฯ</h2>
          <p>รวมพยากรณ์กรุงเทพฯ/ปริมณฑล, AWS, เรดาร์คอมโพสิท และ Bangkok Nowcasting จากแหล่งทางการของ TMD</p>
        </div>
        <span className={styles.badge}>OFFICIAL TMD SOURCES</span>
      </div>

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTop}><span className={styles.icon}>🌧️</span><span className={styles.source}>TMD • FORECAST</span></div>
          <div className={styles.label}>โอกาสฝน กรุงเทพฯ/ปริมณฑล</div>
          <div className={styles.value}>{tmd?.rainChancePercent == null ? "—" : `${tmd.rainChancePercent}%`}</div>
          <div className={styles.levelLabel}>{levelText(forecastLevel)}</div>
          <Scale level={forecastLevel} />
          <p>{tmd?.summary || tmd?.issuedAtRaw || "กำลังรอพยากรณ์ล่าสุด"}</p>
        </article>

        <article className={styles.card}>
          <div className={styles.cardTop}><span className={styles.icon}>🌦️</span><span className={styles.source}>TMD • AWS</span></div>
          <div className={styles.label}>ฝนสะสม 1 ชั่วโมง • AWS กรุงเทพฯ</div>
          <div className={styles.value}>{tmd?.aws.rain1hMm == null ? "—" : `${tmd.aws.rain1hMm.toFixed(1)} mm`}</div>
          <div className={styles.levelLabel}>{tmd?.aws.measurementAvailable ? levelText(awsLevel) : (tmd?.aws.ok ? "ต้นทางออนไลน์ • ยังอ่านค่าตัวเลขไม่ได้" : "AWS unavailable")}</div>
          <Scale level={awsLevel} />
          <p>{tmd?.aws.measurementAvailable ? `15 นาที ${tmd.aws.rain15mMm ?? "—"} mm • วันนี้ ${tmd.aws.rainTodayMm ?? "—"} mm` : "ระบบจะไม่เดาค่าฝนเมื่อหน้า TMD ไม่ส่งค่าตัวเลขใน HTML ที่อ่านได้"}</p>
        </article>

        <SourceCard icon="📡" label="TMD Radar Composite" value={radarState} state={radarState} note="ใช้ดูตำแหน่งและความเข้มของกลุ่มฝนแบบเรดาร์ • หน่วยสเกลต้นทางเป็น mm/hr" />
        <SourceCard icon="🛰️" label="Bangkok Nowcasting" value={nowcastState} state={nowcastState} note="TMD SATDA พยากรณ์ฝนระยะสั้นสำหรับกรุงเทพฯ และปริมณฑล" />
      </div>

      <div className={styles.links}>
        <a href={tmd?.aws.sourceUrl || "https://www.tmd.go.th/weather/province/bangkok"} target="_blank" rel="noreferrer">TMD Bangkok AWS</a>
        <a href={tmd?.radar.sourceUrl || "https://weather.tmd.go.th/composite/index_composite.html"} target="_blank" rel="noreferrer">Radar Composite</a>
        <a href={tmd?.nowcast.sourceUrl || "https://satda.tmd.go.th/wp-content/uploads/data/dashboard/radar_map/bangkok_nowcast.php"} target="_blank" rel="noreferrer">Bangkok Nowcast</a>
        <a href={tmd?.sourceUrl || "https://www.tmd.go.th/forecast/daily"} target="_blank" rel="noreferrer">Daily Forecast</a>
      </div>

      <div className={styles.warning}>หมายเหตุ: ระดับ 1–5 เป็นดัชนีสำหรับ Dashboard นี้เพื่อช่วยสังเกตง่าย ไม่ใช่ระดับประกาศเตือนอย่างเป็นทางการของกรมอุตุนิยมวิทยา • หาก AWS ไม่ส่งค่าตัวเลขแบบอ่านได้ ระบบจะแสดง “—” แทนการประมาณค่า</div>
      {error ? <div className={styles.warning}>⚠️ {error}</div> : null}
    </section>
  );
}
