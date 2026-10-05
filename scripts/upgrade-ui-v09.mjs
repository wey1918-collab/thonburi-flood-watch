import fs from "node:fs/promises";

const dashboardPath = "src/components/LiveDashboardV08.tsx";
const cssPath = "src/app/dashboard-v08.css";
const pagePath = "src/app/page.tsx";

function mustReplace(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error(`Patch target not found: ${label}`);
  return text.replace(before, after);
}

let dashboard = await fs.readFile(dashboardPath, "utf8");
let css = await fs.readFile(cssPath, "utf8");
let page = await fs.readFile(pagePath, "utf8");

dashboard = mustReplace(
  dashboard,
  "type GaugeLevel = 0 | 1 | 2 | 3;\n",
  "type GaugeLevel = 0 | 1 | 2 | 3;\ntype RoadGaugeLevel = 0 | 1 | 2 | 3 | 4 | 5;\n",
  "RoadGaugeLevel type",
);

const oldRoadMonitors = [
  "const ROAD_MONITORS = [",
  "  { code: \"MON.CHARAN\", label: \"ถนนจรัญสนิทวงศ์\" },",
  "  { code: \"MON.BANGKRUI\", label: \"ถนนบางกรวย-ไทรน้อย\" },",
  "  { code: \"MON.RATCHAPHRUEK\", label: \"ถนนราชพฤกษ์\" },",
  "] as const;",
].join("\n");
const newRoadMonitors = [
  "const ROAD_MONITORS = [",
  "  { code: \"MON.CHARAN\", label: \"ถนนจรัญสนิทวงศ์\" },",
  "  { code: \"MON.BANGKRUI\", label: \"ถนนบางกรวย-ไทรน้อย\" },",
  "  { code: \"MON.RATCHAPHRUEK\", label: \"ถนนราชพฤกษ์\" },",
  "  { code: \"FL.BKN.01\", label: \"ถนนอิสรภาพ ช่วงตลาดพรานนก\" },",
  "  { code: \"FL.BKN.02\", label: \"ถนนบรมราชชนนี ช่วงสายใต้\" },",
  "] as const;",
].join("\n");
dashboard = mustReplace(dashboard, oldRoadMonitors, newRoadMonitors, "five road monitors");

if (!dashboard.includes("function roadFiveLevel(")) {
  const roadLevelRegex = /function roadLevel\(cm: number \| null \| undefined\): GaugeLevel \{[\s\S]*?\n\}/;
  const match = dashboard.match(roadLevelRegex);
  if (!match) throw new Error("Patch target not found: roadLevel function");
  const extra = [
    "",
    "function roadFiveLevel(cm: number | null | undefined): RoadGaugeLevel {",
    "  if (cm == null) return 0;",
    "  if (cm < 5) return 1;",
    "  if (cm < 10) return 2;",
    "  if (cm < 15) return 3;",
    "  if (cm < 20) return 4;",
    "  return 5;",
    "}",
    "",
    "function roadFiveLevelLabel(level: RoadGaugeLevel, stale: boolean) {",
    "  if (stale) return \"ข้อมูลเก่า • ไม่ใช้จัดระดับ\";",
    "  if (level === 1) return \"ระดับ 1 • ปกติ\";",
    "  if (level === 2) return \"ระดับ 2 • น้ำท่วมขังเล็กน้อย\";",
    "  if (level === 3) return \"ระดับ 3 • น้ำท่วม\";",
    "  if (level === 4) return \"ระดับ 4 • น้ำสูง\";",
    "  if (level === 5) return \"ระดับ 5 • รุนแรง\";",
    "  return \"ยังไม่มีข้อมูล\";",
    "}",
  ].join("\n");
  dashboard = dashboard.replace(roadLevelRegex, `${match[0]}${extra}`);
}

const roadMonitorReplacement = [
  "function RoadMonitor({ road, label }: { road: RoadFloodStation | undefined; label: string }) {",
  "  const stale = Boolean(road && (road.severity === \"OFFLINE\" || /ข้อมูลเก่า|stale|ขัดข้อง/i.test(road.sourceStatus)));",
  "  const calculatedLevel = roadFiveLevel(road?.depthCm);",
  "  const shownLevel: RoadGaugeLevel = stale ? 0 : calculatedLevel;",
  "  const segmentClass = (segment: 1 | 2 | 3 | 4 | 5) => `${shownLevel >= segment ? \"active\" : \"\"} ${shownLevel === segment ? \"current\" : \"\"}`.trim();",
  "  return (",
  "    <article className={`v08-road-card v08-level-${shownLevel}`}>",
  "      <div className=\"v08-road-title\"><span>🚗</span><strong>{label}</strong></div>",
  "      <div className=\"v08-road-value\">{road?.depthCm == null ? \"—\" : `${road.depthCm.toFixed(1)} cm`}</div>",
  "      <div className={`v08-level-label level-${shownLevel}`}>{roadFiveLevelLabel(shownLevel, stale)}</div>",
  "      <div className=\"v08-road-scale\" aria-label=\"มาตรวัดระดับน้ำท่วมถนนห้าระดับ\">",
  "        <span className={segmentClass(1)}>1<br/><small>&lt; 5 cm</small></span>",
  "        <span className={segmentClass(2)}>2<br/><small>5–&lt;10</small></span>",
  "        <span className={segmentClass(3)}>3<br/><small>10–&lt;15</small></span>",
  "        <span className={segmentClass(4)}>4<br/><small>15–&lt;20</small></span>",
  "        <span className={segmentClass(5)}>5<br/><small>≥ 20 cm</small></span>",
  "      </div>",
  "      <p>{road ? `${road.sourceStatus} • ${road.observedAtRaw || displayTime(road.observedAt)}` : \"กำลังรอข้อมูลจาก road monitor\"}</p>",
  "    </article>",
  "  );",
  "}",
].join("\n");

if (!dashboard.includes("มาตรวัดระดับน้ำท่วมถนนห้าระดับ")) {
  const roadMonitorRegex = /function RoadMonitor\([\s\S]*?\n\}\n\nfunction WaterStationGauge/;
  if (!roadMonitorRegex.test(dashboard)) throw new Error("Patch target not found: RoadMonitor component");
  dashboard = dashboard.replace(roadMonitorRegex, `${roadMonitorReplacement}\n\nfunction WaterStationGauge`);
}

dashboard = dashboard.replace("MULTI-SOURCE FLOOD DASHBOARD V0.8", "MULTI-SOURCE FLOOD DASHBOARD V0.9");
dashboard = dashboard.replace("น้ำบนถนน • สูงสุด 3 เส้นทาง", "น้ำบนถนน • สูงสุด 5 เส้นทาง");
dashboard = dashboard.replace(
  "note=\"จรัญสนิทวงศ์ • บางกรวย-ไทรน้อย • ราชพฤกษ์\"",
  "note=\"จรัญสนิทวงศ์ • บางกรวย-ไทรน้อย • ราชพฤกษ์ • อิสรภาพ • บรมราชชนนี\"",
);
dashboard = dashboard.replace("<span className=\"section-kicker\">ROAD WATCH</span><h2>เฝ้าระวัง 3 ถนนที่เพิ่มใหม่</h2>", "<span className=\"section-kicker\">ROAD 5-LEVEL DASHBOARD</span><h2>ถนน 5 เส้น • Dashboard 5 ระดับ</h2>");
dashboard = dashboard.replace("ค่าจริงถ้ามีเซนเซอร์ตรงถนน; หากไม่มีจะแสดงสถานีใกล้เคียงชัดเจน", "ตัวเลขจริง + ระดับ 1–5; ข้อมูลเก่าจะไม่ถูกตีความว่าเป็นระดับ 1");

const roadGridOld = [
  "        <div className=\"v08-road-grid\">",
  "          {requestedRoads.map((item) => <RoadMonitor key={item.code} road={item.road} label={item.label} />)}",
  "        </div>",
  "      </section>",
].join("\n");
const roadGridNew = [
  "        <div className=\"v08-road-grid\">",
  "          {requestedRoads.map((item) => <RoadMonitor key={item.code} road={item.road} label={item.label} />)}",
  "        </div>",
  "        <p className=\"v08-threshold-note\">BMA ระบุเกณฑ์หลักของน้ำท่วมถนนที่ 5 ซม. = น้ำท่วมขังเล็กน้อย และ 10 ซม. = น้ำท่วม ส่วนระดับ 3–5 ในแดชบอร์ดนี้แบ่งช่วง 10–&lt;15, 15–&lt;20 และ ≥20 ซม. เพื่อให้อ่านความรุนแรงได้ละเอียดขึ้น ไม่ใช่ระดับประกาศทางการของ BMA</p>",
  "      </section>",
].join("\n");
dashboard = mustReplace(dashboard, roadGridOld, roadGridNew, "road threshold note");
dashboard = dashboard.replace(
  "หมุด MON.CHARAN / MON.BANGKRUI / MON.RATCHAPHRUEK คือจุด monitor ของถนนที่เพิ่มใหม่",
  "หมุด Road Monitor ครอบคลุมจรัญสนิทวงศ์ บางกรวย-ไทรน้อย ราชพฤกษ์ อิสรภาพ และบรมราชชนนี",
);
dashboard = dashboard.replace("<summary><span>ถนนและสถานีทั้งหมด</span>", "<summary><span>ถนน 5 เส้นและสถานีทั้งหมด</span>");

css = css.replace("/* V0.8 three-level dashboard */", "/* V0.9 dashboard: 3-level rain/water + 5-level road watch */");
css = mustReplace(
  css,
  ".v08-level-3::before { background:var(--warn); }",
  ".v08-level-3::before { background:var(--warn); }\n.v08-level-4::before { background:#ff744f; }\n.v08-level-5::before { background:var(--critical); }",
  "road level top colors",
);
css = mustReplace(
  css,
  ".v08-level-label.level-3 { color:#ffb07b; background:rgba(255,145,77,.14); }",
  ".v08-level-label.level-3 { color:#ffb07b; background:rgba(255,145,77,.14); }\n.v08-level-label.level-4 { color:#ff9f82; background:rgba(255,116,79,.14); }\n.v08-level-label.level-5 { color:#ff9ca3; background:rgba(255,93,104,.15); }",
  "road level labels",
);
css = mustReplace(
  css,
  ".v08-road-scale { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; margin-top:10px; }",
  ".v08-road-scale { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:5px; margin-top:10px; }",
  "five road scale columns",
);
css = mustReplace(
  css,
  ".v08-road-scale > span:nth-child(3) { box-shadow:inset 0 -2px 0 rgba(255,145,77,.7); }\n.v08-road-scale > span.active { opacity:1; background:rgba(255,255,255,.06); }",
  ".v08-road-scale > span:nth-child(3) { box-shadow:inset 0 -2px 0 rgba(255,145,77,.7); }\n.v08-road-scale > span:nth-child(4) { box-shadow:inset 0 -2px 0 rgba(255,116,79,.78); }\n.v08-road-scale > span:nth-child(5) { box-shadow:inset 0 -2px 0 rgba(255,93,104,.82); }\n.v08-road-scale > span:nth-child(1).active { background:rgba(82,210,115,.10); }\n.v08-road-scale > span:nth-child(2).active { background:rgba(246,195,68,.10); }\n.v08-road-scale > span:nth-child(3).active { background:rgba(255,145,77,.10); }\n.v08-road-scale > span:nth-child(4).active { background:rgba(255,116,79,.11); }\n.v08-road-scale > span:nth-child(5).active { background:rgba(255,93,104,.12); }\n.v08-road-scale > span.active { opacity:1; }\n.v08-road-scale > span.current { outline:1px solid rgba(255,255,255,.28); outline-offset:-1px; }\n.v08-road-card.v08-level-0 .v08-road-scale > span { opacity:.28; }",
  "five road scale colors",
);
css = mustReplace(
  css,
  ".v08-road-scale small { color:var(--muted-2); font-size:8px; }",
  ".v08-road-scale small { color:var(--muted-2); font-size:7px; line-height:1.2; }",
  "road scale text",
);
css = css.replace(
  "  .v08-gauge-value,.v08-road-value { font-size:28px; }",
  "  .v08-gauge-value,.v08-road-value { font-size:28px; }\n  .v08-road-scale { gap:3px; }\n  .v08-road-scale > span { padding:6px 2px; font-size:9px; }\n  .v08-road-scale small { font-size:6.5px; }",
);

page = page.replace(
  "Road Monitor: จรัญสนิทวงศ์, บางกรวย-ไทรน้อย, ราชพฤกษ์",
  "Road Monitor 5 ระดับ: จรัญสนิทวงศ์, บางกรวย-ไทรน้อย, ราชพฤกษ์, อิสรภาพ, บรมราชชนนี",
);

await Promise.all([
  fs.writeFile(dashboardPath, dashboard, "utf8"),
  fs.writeFile(cssPath, css, "utf8"),
  fs.writeFile(pagePath, page, "utf8"),
]);

console.log("Applied V0.9 five-road, five-level dashboard patch.");
