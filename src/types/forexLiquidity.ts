export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type LiquidityLevel = {
  type:
    | "PREVIOUS_DAY_HIGH"
    | "PREVIOUS_DAY_LOW"
    | "ASIA_HIGH"
    | "ASIA_LOW"
    | "DAILY_OPEN"
    | "WEEKLY_HIGH"
    | "WEEKLY_LOW"
    | "ROUND_MAJOR"
    | "ROUND_MEDIUM"
    | "ROUND_MINOR"
    | "INTRADAY_SWING";
  label: string;
  price: number;
  strength: number;
  distancePips: number;
  distancePercent: number;
};

export type SignalStatus =
  | "IGNORE"
  | "WATCH"
  | "SWEEP_DETECTED"
  | "CONFIRMATION_PENDING"
  | "CONFIRMED_SIGNAL"
  | "BLOCKED";

export type SignalDirection = "BULLISH" | "BEARISH" | "NONE";

export type LiquiditySignal = {
  symbol: string;
  assetClass: string;
  status: SignalStatus;
  direction: SignalDirection;
  score: number;
  currentPrice: number;
  sweptLevel?: LiquidityLevel;
  sweepExtreme?: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  riskPips?: number;
  riskRewardTP1?: number;
  riskRewardTP2?: number;
  riskRewardTP3?: number;
  spread?: number;
  atrM15?: number;
  session: string;
  explanation: string;
  invalidation: string;
  warnings: string[];
  components: {
    levelQuality: number;
    sweepQuality: number;
    session: number;
    microstructure: number;
    riskReward: number;
    spread: number;
    volatility: number;
    newsPenalty: number;
  };
};

export type BacktestLog = {
  signalId: string;
  timestamp: string;
  symbol: string;
  direction: string;
  statusAtDetection: string;
  score: number;
  sweptLevel: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  resultLater: string;
  maxFavorableExcursion: number;
  maxAdverseExcursion: number;
  notes: string;
};
