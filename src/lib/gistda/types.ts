export type GistdaFloodContext = {
  ok: boolean;
  checkedAt: string;
  areaLabel: string;
  intersectingFeatureCount: number | null;
  sourceUrl: string;
  note: string;
  error?: string;
};
