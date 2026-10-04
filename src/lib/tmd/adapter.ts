import type { TmdBangkokForecast } from "./types";

const BASES = [
  "https://www.tmd.go.th/forecast/daily",
  "https://www5.tmd.go.th/forecast/daily",
] as const;
const PRIMARY_BASE = BASES[0];
const WEATHER_THAI = "https://www5.tmd.go.th/weather/weatherthailand";

function decodeHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>|<\/section>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
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
  const slots = hour >= 12 ? ["1200", "0600"] : ["0600", "1200"];
  const dated = BASES.flatMap((base) => slots.map((slot) => `${base}/${dmy}${slot}`));
  return [...dated, ...BASES, WEATHER_THAI];
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ThonburiFloodWatch/0.4; +https://thonburi-flood-watch.vercel.app)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.7",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function num(pattern: RegExp, text: string) {
  const m = text.match(pattern);
  return m ? Number(m[1]) : null;
}

function findBangkokSection(text: string) {
  const matches = [...text.matchAll(/กรุงเทพ(?:มหานคร)?(?:ฯ)?\s*และปริมณฑล/g)];
  const last = matches.at(-1);
  if (!last || last.index == null) return null;

  let section = text.slice(last.index);
  const endMarkers = [
    /\nภาคเหนือ/, /\nภาคตะวันออกเฉียงเหนือ/, /\nภาคกลาง/, /\nภาคตะวันออก/,
    /\nภาคใต้/, /\nออกประกาศ/, /\nTags:/, /\nหมวดหมู่:/, /\nพยากรณ์อากาศ.*?(?:วัน|เวลา)/,
  ];
  const ends = endMarkers
    .map((pattern) => section.search(pattern))
    .filter((index) => index > 0);
  if (ends.length) section = section.slice(0, Math.min(...ends));
  return section;
}

function compactSummary(section: string) {
  const cleaned = section
    .replace(/กรุงเทพ(?:มหานคร)?(?:ฯ)?\s*และปริมณฑล\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const boundary = cleaned.search(/(?:อุณหภูมิต่ำสุด|ลม\s|ทะเลมีคลื่น|ออกประกาศ)/);
  const forecastOnly = boundary > 0 ? cleaned.slice(0, boundary).trim() : cleaned;
  if (forecastOnly.length <= 240) return forecastOnly;
  const sentence = forecastOnly.match(/^(.{60,240}?[.!?]|.{60,240}?\s(?:โดย|และมี|กับ))\s/);
  return (sentence?.[1] || forecastOnly.slice(0, 237) + "…").trim();
}

function parse(url: string, html: string): TmdBangkokForecast | null {
  const text = decodeHtml(html);
  const section = findBangkokSection(text);
  if (!section) return null;

  const rainChancePercent = num(/ร้อยละ\s*(\d{1,3})\s*ของพื้นที่/, section);
  const temp = section.match(/อุณหภูมิต่ำสุด\s*(\d+)\s*-\s*(\d+)[\s\S]{0,100}?อุณหภูมิสูงสุด\s*(\d+)\s*-\s*(\d+)/);
  const wind = section.match(/ลม[^\n]{0,160}?ความเร็ว\s*([\d\-]+\s*กม\.\/ชม\.)/);
  const issued = text.match(/ประจำวันที่\s*([^\n]{0,80})/)?.[1]?.trim()
    || text.match(/ออกประกาศ\s*([^\n]{0,80})/)?.[1]?.trim()
    || "";
  const period = text.match(/(\d{1,2}:\d{2}\s*น\.\s*(?:วันนี้\s*(?:ถึง|-)|วันนี้\s*-?)\s*\d{1,2}:\d{2}\s*น\.\s*วันพรุ่งนี้)/)?.[1]
    || text.match(/(\d{1,2}:\d{2}\s*น\.\s*วันนี้\s*-\s*\d{1,2}:\d{2}\s*น\.\s*วันพรุ่งนี้)/)?.[1]
    || "";

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
    summary: compactSummary(section),
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
    sourceUrl: PRIMARY_BASE,
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
