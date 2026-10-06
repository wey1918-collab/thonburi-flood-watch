import { NextResponse } from "next/server";
import { getBmaLiveSnapshot } from "@/lib/bma/adapter";
import { checkApiAbuseProtection } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

function blockedResponse(result: ReturnType<typeof checkApiAbuseProtection>) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (result.status === 429) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
  }
  return NextResponse.json({ ok: false, error: result.reason }, { status: result.status, headers });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.search.length > 512) {
    return NextResponse.json(
      { ok: false, error: "Request query is too long" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const protection = checkApiAbuseProtection(request, { scope: "bma-live" });
  if (!protection.allowed) return blockedResponse(protection);

  try {
    const data = await getBmaLiveSnapshot();
    return NextResponse.json(data, {
      status: data.ok || data.rain.length || data.water.length || data.roadFlood.length ? 200 : 502,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[api/bma/live] upstream request failed", error);
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        rain: [],
        water: [],
        roadFlood: [],
        errors: ["BMA live data is temporarily unavailable"],
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
