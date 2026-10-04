export type TidePoint = {
  at: string;
  levelMslM: number;
};

export type TideSnapshot = {
  ok: boolean;
  station: string;
  stationCode: string;
  datum: "MSL";
  isPrediction: true;
  currentHour: TidePoint | null;
  nextHigh: {
    startAt: string;
    endAt: string;
    levelMslM: number;
  } | null;
  today: TidePoint[];
  sourceUrl: string;
  note: string;
  error?: string;
};
