import { NextResponse } from "next/server";
import { getBmaLiveSnapshot } from "@/lib/bma/adapter";

export const runtime = "nodejs";

export async function GET() {
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
      { status: 502 }
    );
  }
}
