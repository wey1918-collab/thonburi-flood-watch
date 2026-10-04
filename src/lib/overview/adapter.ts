import { getBmaLiveSnapshot } from "@/lib/bma/adapter";
import { getBmaRelaySnapshot } from "@/lib/bma/relay";
import { getRidC29Snapshot } from "@/lib/rid/adapter";
import { getBangkokPortTide } from "@/lib/tide/adapter";
import { getTmdBangkokForecast } from "@/lib/tmd/adapter";
import type { BmaLiveSnapshot } from "@/lib/bma/types";
import type { LiveOverview } from "./types";

async function getBmaWithRelay(): Promise<BmaLiveSnapshot> {
  const relay = await getBmaRelaySnapshot();

  // A fresh relay snapshot avoids direct BMA calls from Vercel, which are
  // currently rejected/blocked by the upstream BMA network.
  if (relay?.ok) return relay;

  const live = await getBmaLiveSnapshot();
  if (live.ok) return live;

  // A stale relay is still preferable to invented values. Its stations are
  // explicitly marked OFFLINE/old by getBmaRelaySnapshot().
  return relay ?? live;
}

export async function getLiveOverview(): Promise<LiveOverview> {
  const [bma, tmd, ridC29] = await Promise.all([
    getBmaWithRelay(),
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
