import type { BmaLiveSnapshot } from "@/lib/bma/types";
import type { GistdaFloodContext } from "@/lib/gistda/types";
import type { RidC29Snapshot } from "@/lib/rid/types";
import type { ThaiWaterSnapshot } from "@/lib/thaiwater/types";
import type { TideSnapshot } from "@/lib/tide/types";
import type { TmdBangkokForecast } from "@/lib/tmd/types";

export type LiveOverview = {
  ok: boolean;
  degraded: boolean;
  generatedAt: string;
  bma: BmaLiveSnapshot;
  thaiWater: ThaiWaterSnapshot;
  gistda: GistdaFloodContext;
  tmd: TmdBangkokForecast;
  ridC29: RidC29Snapshot;
  tide: TideSnapshot;
  errors: string[];
};
