import type { BmaLiveSnapshot } from "@/lib/bma/types";
import type { RidC29Snapshot } from "@/lib/rid/types";
import type { TideSnapshot } from "@/lib/tide/types";
import type { TmdBangkokForecast } from "@/lib/tmd/types";

export type LiveOverview = {
  ok: boolean;
  generatedAt: string;
  bma: BmaLiveSnapshot;
  tmd: TmdBangkokForecast;
  ridC29: RidC29Snapshot;
  tide: TideSnapshot;
  errors: string[];
};
