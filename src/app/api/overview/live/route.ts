import { NextResponse } from "next/server";
import { getLiveOverview } from "@/lib/overview/adapter";
import { checkApiAbuseProtection } from "@/lib/security/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const protection = checkApiAbuseProtection(request, { scope: "overview-live" });
  if (!protection.allowed) return blockedResponse(protection);

  try {
    const data = await getLiveOverview();
    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[api/overview/live] upstream request failed", error);
    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        generatedAt: new Date().toISOString(),
        errors: ["Live overview is temporarily unavailable"],
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
