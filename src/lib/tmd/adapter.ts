import type { TmdBangkokForecast } from "./types";

const BASE = "https://www.tmd.go.th/forecast/daily";

function decodeHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function bangkokDateParts(date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: Number(parts.hour) };
}

function candidateUrls() {
  const { year, month, day, hour } = bangkokDateParts();
  const dmy = `${day}${month}${year}`;
  // TMD URLs observed: 11:00 issue => ...1200, 05:00 issue => ...0600.
  const slots = hour >= 12 ? ["1200", "0600"] : ["0600", "1200"];
  return [...slots.map((s) => `${BASE}/${dmy}${s}`), BASE];
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ThonburiFloodWatch/0.3 (+community-dashboard)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "th,en;q=0.8",
    },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function num(pattern: RegExp, text: string) {
  const m = text.match(pattern);
  return m ? Number(m[1]) : null;
}

function parse(url: string, html: string): TmdBangkokForecast | null {
  const text = decodeHtml(html);
  const marker = text.search(/กรุงเทพ(?:มหานคร)?และปริมณฑล/);
  if (marker < 0) return null;
  let section = text.slice(marker);
  const end = section.search(/\nออกประกาศ|\nTags:|\nหมวดหมู่:/);
  if (end > 0) section = section.slice(0, end);

  const rainChancePercent = num(/ร้อยละ\s*(\d{1,3})\s*ของพื้นที่/, section);
  const temp = section.match(/อุณหภูมิต่ำสุด\s*(\d+)\s*-\s*(\d+)[\s\S]{0,80}?อุณหภูมิสูงสุด\s*(\d+)\s*-\s*(\d+)/);
  const wind = section.match(/ลม[^\n]{0,120}?ความเร็ว\s*([\d\-]+\s*กม\.\/ชม\.)/);
  const issued = text.match(/ประจำวันที่\s*([^\n]{0,80})/)?.[1]?.trim() || "";
  const period = text.match(/(\d{1,2}:\d{2}\s*น\.\s*วันนี้\s*ถึง\s*\d{1,2}:\d{2}\s*น\.\s*วันพรุ่งนี้)/)?.[1] || "";

  const summary = section
    .replace(/กรุงเทพ(?:มหานคร)?และปริมณฑล\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    ok: true,
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    issuedAtRaw: issued,
    periodRaw: period,
    rainChancePercent,
    heavyRain: /ฝนตกหนัก/.test(section),
    gustyWind: /ลมกระโชกแรง/.test(section),
    minTempC: temp ? Number(temp[1]) : null,
    maxTempC: temp ? Number(temp[4]) : null,
    windText: wind?.[0] || "",
    summary: summary.slice(0, 520),
  };
}

export async function getTmdBangkokForecast(): Promise<TmdBangkokForecast> {
  const errors: string[] = [];
  for (const url of candidateUrls()) {
    try {
      const html = await fetchHtml(url);
      const parsed = parse(url, html);
      if (parsed) return parsed;
      errors.push(`${url}: ไม่พบส่วนกรุงเทพและปริมณฑล`);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : "fetch failed"}`);
    }
  }
  return {
    ok: false,
    sourceUrl: BASE,
    fetchedAt: new Date().toISOString(),
    issuedAtRaw: "",
    periodRaw: "",
    rainChancePercent: null,
    heavyRain: false,
    gustyWind: false,
    minTempC: null,
    maxTempC: null,
    windText: "",
    summary: "",
    error: errors.join(" • "),
  };
}
