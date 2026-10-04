import type { RidC29Snapshot } from "./types";

const LIST_URL = "https://www.rid.go.th/th/water-situation";
const BUILD_FALLBACK_URL = "https://www.rid.go.th/th/water-situation/28977"; // 3 Oct 2026 report; freshness guard prevents silent stale use.

function decodeHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ThonburiFloodWatch/0.3 (+community-dashboard)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "th,en;q=0.8",
    },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 1800 },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function discoverReportUrls(html: string) {
  const ids = new Set<number>();
  for (const match of html.matchAll(/(?:https?:\/\/www\.rid\.go\.th)?\/th\/water-situation\/(\d+)/gi)) {
    ids.add(Number(match[1]));
  }
  return [...ids]
    .filter(Number.isFinite)
    .sort((a, b) => b - a)
    .slice(0, 12)
    .map((id) => `https://www.rid.go.th/th/water-situation/${id}`);
}

const MONTHS: Record<string, number> = {
  มกราคม: 1, กุมภาพันธ์: 2, มีนาคม: 3, เมษายน: 4, พฤษภาคม: 5, มิถุนายน: 6,
  กรกฎาคม: 7, สิงหาคม: 8, กันยายน: 9, ตุลาคม: 10, พฤศจิกายน: 11, ธันวาคม: 12,
};

function parseThaiDateTime(text: string): { iso: string | null; raw: string } {
  const m = text.match(/วันที่\s*(\d{1,2})\s+([ก-๙]+)\s+(\d{4})\s+เวลา\s+(\d{1,2}):(\d{2})\s*น\./);
  if (!m) return { iso: null, raw: "" };
  const month = MONTHS[m[2]];
  if (!month) return { iso: null, raw: m[0] };
  const yearRaw = Number(m[3]);
  const year = yearRaw >= 2400 ? yearRaw - 543 : yearRaw;
  const isoLocal = `${year}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00+07:00`;
  const date = new Date(isoLocal);
  return { iso: Number.isNaN(date.getTime()) ? null : date.toISOString(), raw: m[0] };
}

function parseReport(url: string, html: string): RidC29Snapshot | null {
  const text = decodeHtml(html);
  const m = text.match(/\(C\.29A?\)\s*อ\.บางไทร[^()]{0,160}?\(([\d,]+(?:\.\d+)?)\)\s*,\s*\(([\d,]+(?:\.\d+)?)\)\s*ลบ\.ม\.\/วิ/i)
    || text.match(/\(C\.29A?\)\s*Bang Sai[^()]{0,160}?\(([\d,]+(?:\.\d+)?)\)\s*,\s*\(([\d,]+(?:\.\d+)?)\)\s*m³\/sec/i);
  if (!m) return null;
  const flowM3s = Number(m[1].replace(/,/g, ""));
  const previousFlowM3s = Number(m[2].replace(/,/g, ""));
  const changePercent = previousFlowM3s > 0 ? ((flowM3s - previousFlowM3s) / previousFlowM3s) * 100 : null;
  const trend = flowM3s > previousFlowM3s ? "RISING" : flowM3s < previousFlowM3s ? "FALLING" : "STABLE";
  const dt = parseThaiDateTime(text);
  const stale = dt.iso ? Date.now() - new Date(dt.iso).getTime() > 36 * 60 * 60 * 1000 : true;
  return {
    ok: true,
    station: "C.29",
    stationName: "บางไทร จ.พระนครศรีอยุธยา",
    flowM3s,
    previousFlowM3s,
    changePercent,
    trend,
    observedAt: dt.iso,
    observedAtRaw: dt.raw,
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    stale,
  };
}

export async function getRidC29Snapshot(): Promise<RidC29Snapshot> {
  const errors: string[] = [];
  const configured = process.env.RID_RUNOFF_REPORT_URL?.trim();
  const candidates: string[] = [];

  if (configured) candidates.push(configured);
  try {
    const listing = await fetchText(LIST_URL);
    candidates.push(...discoverReportUrls(listing));
  } catch (error) {
    errors.push(`RID listing: ${error instanceof Error ? error.message : "fetch failed"}`);
  }
  candidates.push(BUILD_FALLBACK_URL);

  for (const url of [...new Set(candidates)]) {
    try {
      const html = await fetchText(url);
      const parsed = parseReport(url, html);
      if (parsed) return parsed;
      errors.push(`${url}: ไม่พบ C.29`);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : "fetch failed"}`);
    }
  }

  return {
    ok: false,
    station: "C.29",
    stationName: "บางไทร จ.พระนครศรีอยุธยา",
    flowM3s: null,
    previousFlowM3s: null,
    changePercent: null,
    trend: "UNKNOWN",
    observedAt: null,
    observedAtRaw: "",
    sourceUrl: LIST_URL,
    fetchedAt: new Date().toISOString(),
    stale: true,
    error: errors.join(" • "),
  };
}
