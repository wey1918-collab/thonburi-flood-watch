import { NextResponse } from "next/server";
import { getLiveOverview } from "@/lib/overview/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
      { status: 502 }
    );
  }
}
