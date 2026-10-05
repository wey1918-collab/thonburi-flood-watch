import { NextResponse } from "next/server";
import { getLiveOverview } from "@/lib/overview/adapter";
import { checkApiRateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const data = await getLiveOverview();
    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        generatedAt: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : "Unknown error"],
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
