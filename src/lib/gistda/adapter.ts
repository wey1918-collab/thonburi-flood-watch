import type { GistdaFloodContext } from "./types";

const SOURCE_URL = "https://gistdaportal.gistda.or.th/arcgis/rest/services/app/GISTDA_flood/MapServer/0";
const ENVELOPE = "100.42,13.68,100.54,13.83";
const QUERY_URL = `${SOURCE_URL}/query?where=1%3D1&geometry=${encodeURIComponent(ENVELOPE)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`;

export async function getGistdaFloodContext(): Promise<GistdaFloodContext> {
  try {
    const response = await fetch(QUERY_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { count?: unknown; error?: { message?: string } };
    if (payload.error) throw new Error(payload.error.message || "ArcGIS query error");
    const count = typeof payload.count === "number" && Number.isFinite(payload.count) ? payload.count : null;
    if (count == null) throw new Error("GISTDA response ไม่มี count");
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      areaLabel: "บางกอกน้อย–ธนบุรี–บางกอกใหญ่",
      intersectingFeatureCount: count,
      sourceUrl: SOURCE_URL,
      note: count > 0
        ? `พบ ${count} polygon ของชั้นพื้นที่ประสบภัยน้ำท่วม GISTDA ที่ตัดกับกรอบพื้นที่ตรวจสอบ`
        : "ไม่พบ polygon ของชั้นพื้นที่ประสบภัยน้ำท่วม GISTDA ในกรอบพื้นที่ตรวจสอบ ณ รอบนี้; ไม่ใช่การรับรองว่าไม่มีน้ำท่วมเฉพาะจุด",
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      areaLabel: "บางกอกน้อย–ธนบุรี–บางกอกใหญ่",
      intersectingFeatureCount: null,
      sourceUrl: SOURCE_URL,
      note: "GISTDA ใช้เป็นข้อมูลยืนยันเชิงพื้นที่เสริม ไม่ใช้แทนเซนเซอร์ภาคพื้นดิน",
      error: error instanceof Error ? error.message : "GISTDA unavailable",
    };
  }
}
