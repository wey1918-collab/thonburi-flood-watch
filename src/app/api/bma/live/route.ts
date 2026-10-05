import { NextResponse } from "next/server";
import { getBmaLiveSnapshot } from "@/lib/bma/adapter";
import { checkApiRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.search.length > 512) {
    return NextResponse.json(
      { ok: false, error: "Request query is too long" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rate = checkApiRateLimit(request, { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  try {
    const data = await getBmaLiveSnapshot();
    return NextResponse.json(data, {
      status: data.ok || data.rain.length || data.water.length || data.roadFlood.length ? 200 : 502,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        rain: [],
        water: [],
        roadFlood: [],
        errors: [error instanceof Error ? error.message : "Unknown error"],
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
