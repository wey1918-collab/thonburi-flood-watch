import { getBmaLiveSnapshot } from "@/lib/bma/adapter";
import { getBmaRelaySnapshot } from "@/lib/bma/relay";
import { getGistdaFloodContext } from "@/lib/gistda/adapter";
import { getRidC29Snapshot } from "@/lib/rid/adapter";
import { getThaiWaterBangkokContext, getThaiWaterFromRelay } from "@/lib/thaiwater/adapter";
import { getBangkokPortTide } from "@/lib/tide/adapter";
import { getTmdBangkokForecast } from "@/lib/tmd/adapter";
import type { BmaLiveSnapshot } from "@/lib/bma/types";
import type { LiveOverview } from "./types";

async function getBmaWithRelay(): Promise<BmaLiveSnapshot> {
  const relay = await getBmaRelaySnapshot();
  if (relay) return relay;
  return getBmaLiveSnapshot();
}

export async function getLiveOverview(): Promise<LiveOverview> {
  const [bma, thaiWaterDirect, tmd, ridC29, gistda] = await Promise.all([
    getBmaWithRelay(),
    getThaiWaterBangkokContext(),
    getTmdBangkokForecast(),
    getRidC29Snapshot(),
    getGistdaFloodContext(),
  ]);
  const tide = getBangkokPortTide();
  const thaiWater = thaiWaterDirect.ok ? thaiWaterDirect : (getThaiWaterFromRelay(bma) ?? thaiWaterDirect);
  const errors: string[] = [];

  if (!bma.ok) errors.push(...bma.errors.map((e) => `Local/BMA relay: ${e}`));
  if (!thaiWater.ok) errors.push(...thaiWater.errors.map((e) => `ThaiWater: ${e}`));
  if (!tmd.ok && tmd.error) errors.push(`TMD: ${tmd.error}`);
  if (!ridC29.ok && ridC29.error) errors.push(`RID: ${ridC29.error}`);
  if (!tide.ok && tide.error) errors.push(`Tide: ${tide.error}`);
  if (!gistda.ok && gistda.error) errors.push(`GISTDA: ${gistda.error}`);

  return {
    ok: true,
    degraded: errors.length > 0,
    generatedAt: new Date().toISOString(),
    bma,
    thaiWater,
    gistda,
    tmd,
    ridC29,
    tide,
    errors,
  };
}
