import { getBmaLiveSnapshot } from "@/lib/bma/adapter";
import { getRidC29Snapshot } from "@/lib/rid/adapter";
import { getBangkokPortTide } from "@/lib/tide/adapter";
import { getTmdBangkokForecast } from "@/lib/tmd/adapter";
import type { LiveOverview } from "./types";

export async function getLiveOverview(): Promise<LiveOverview> {
  const [bma, tmd, ridC29] = await Promise.all([
    getBmaLiveSnapshot(),
    getTmdBangkokForecast(),
    getRidC29Snapshot(),
  ]);
  const tide = getBangkokPortTide();
  const errors: string[] = [];

  if (!bma.ok) errors.push(...bma.errors.map((e) => `BMA: ${e}`));
  if (!tmd.ok && tmd.error) errors.push(`TMD: ${tmd.error}`);
  if (!ridC29.ok && ridC29.error) errors.push(`RID: ${ridC29.error}`);
  if (!tide.ok && tide.error) errors.push(`Tide: ${tide.error}`);

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    bma,
    tmd,
    ridC29,
    tide,
    errors,
  };
}
