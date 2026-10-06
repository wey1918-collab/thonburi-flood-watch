import type { TmdAwsRainContext, TmdBangkokForecast, TmdSourceProbe } from "./types";

const BASES = [
  "https://www.tmd.go.th/forecast/daily",
  "https://www5.tmd.go.th/forecast/daily",
] as const;
const PRIMARY_BASE = BASES[0];
const WEATHER_THAI = "https://www5.tmd.go.th/weather/weatherthailand";
const TMD_AWS_BANGKOK = "https://www.tmd.go.th/weather/province/bangkok";
const TMD_RADAR_COMPOSITE = "https://weather.tmd.go.th/composite/index_composite.html";
const TMD_BANGKOK_NOWCAST = "https://satda.tmd.go.th/wp-content/uploads/data/dashboard/radar_map/bangkok_nowcast.php";

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

async function fetchHtml(url: string, timeoutMs = 20000) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ThonburiFloodWatch/1.0; +https://thonburi-flood-watch.vercel.app)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "th-TH,th;q=0.9,en;q=0.7",
    },
    signal: AbortSignal.timeout(timeoutMs),
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

function parseForecast(url: string, html: string) {
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

function parseAwsRain(html: string): TmdAwsRainContext {
  const text = decodeHtml(html);
  const start = text.search(/สภาพอากาศปัจจุบันจากระบบตรวจอากาศอัตโนมัติ\s*\(AWS\)/i);
  const remainder = start >= 0 ? text.slice(start) : text;
  const end = remainder.search(/สภาพอากาศปัจจุบันจากสถานีอุตุนิยมวิทยา/i);
  const section = end > 0 ? remainder.slice(0, end) : remainder.slice(0, 3000);
  const rain15mMm = num(/ฝนสะสม\s*15\s*นาที\s*([0-9]+(?:\.[0-9]+)?)\s*(?:มม\.?|mm)/i, section);
  const rain1hMm = num(/ฝนสะสม\s*1\s*ชั่วโมง\s*([0-9]+(?:\.[0-9]+)?)\s*(?:มม\.?|mm)/i, section);
  const rainTodayMm = num(/ฝนสะสมวันนี้[^0-9]{0,80}([0-9]+(?:\.[0-9]+)?)\s*(?:มม\.?|mm)/i, section);
  const observedAtRaw = section.match(/ออกประกาศ\s*([^\n]{1,80})/)?.[1]?.trim() || "";
  const measurementAvailable = [rain15mMm, rain1hMm, rainTodayMm].some((value) => value != null);

  return {
    ok: true,
    measurementAvailable,
    sourceUrl: TMD_AWS_BANGKOK,
    fetchedAt: new Date().toISOString(),
    rain15mMm,
    rain1hMm,
    rainTodayMm,
    observedAtRaw,
  };
}

async function getAwsRain(): Promise<TmdAwsRainContext> {
  try {
    return parseAwsRain(await fetchHtml(TMD_AWS_BANGKOK, 10000));
  } catch (error) {
    return {
      ok: false,
      measurementAvailable: false,
      sourceUrl: TMD_AWS_BANGKOK,
      fetchedAt: new Date().toISOString(),
      rain15mMm: null,
      rain1hMm: null,
      rainTodayMm: null,
      observedAtRaw: "",
      error: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

async function probeSource(sourceUrl: string): Promise<TmdSourceProbe> {
  const checkedAt = new Date().toISOString();
  try {
    await fetchHtml(sourceUrl, 10000);
    return { ok: true, sourceUrl, checkedAt };
  } catch (error) {
    return {
      ok: false,
      sourceUrl,
      checkedAt,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

export async function getTmdBangkokForecast(): Promise<TmdBangkokForecast> {
  const auxPromise = Promise.all([
    getAwsRain(),
    probeSource(TMD_RADAR_COMPOSITE),
    probeSource(TMD_BANGKOK_NOWCAST),
  ]);
  const errors: string[] = [];
  let parsedForecast: ReturnType<typeof parseForecast> = null;

  for (const url of candidateUrls()) {
    try {
      const html = await fetchHtml(url);
      const parsed = parseForecast(url, html);
      if (parsed) {
        parsedForecast = parsed;
        break;
      }
      errors.push(`${url}: ไม่พบส่วนกรุงเทพและปริมณฑล`);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : "fetch failed"}`);
    }
  }

  const [aws, radar, nowcast] = await auxPromise;

  if (parsedForecast) {
    return {
      ok: true,
      ...parsedForecast,
      aws,
      radar,
      nowcast,
    };
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
    aws,
    radar,
    nowcast,
    error: errors.join(" • "),
  };
}
