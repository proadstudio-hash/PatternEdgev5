export const CURRENT_FEATURE_VERSION = "v1_RSI14_ADX14_ATR14_ST10x3_EMA20_EMA50_regular";

export const teachingConfigs = [
  { id: "M15_3M", interval: "15m", period: "3mo", role: "recent_intraday" },
  { id: "M15_6M", interval: "15m", period: "6mo", role: "robust_intraday" },
  { id: "H1_3M", interval: "1h", period: "3mo", role: "recent_swing" },
  { id: "H1_6M", interval: "1h", period: "6mo", role: "balanced_swing" },
  { id: "H1_1Y", interval: "1h", period: "1y", role: "stable_swing" }
];

export const enabledTeachingConfigs = [
  "M15_6M",
  "H1_6M",
  "H1_1Y"
];

export const realtimeScanConfigs = [
  { id: "T1H_1M", interval: "1m", lookback: "1h", role: "entry_trigger" },
  { id: "T1D_15M", interval: "15m", lookback: "1d", role: "micro_intraday_setup" },
  { id: "T2D_15M", interval: "15m", lookback: "2d", role: "short_intraday_setup" },
  { id: "T3D_15M", interval: "15m", lookback: "3d", role: "main_intraday_setup" },
  { id: "T5D_15M", interval: "15m", lookback: "5d", role: "short_swing_setup" },
  { id: "T2W_1H", interval: "1h", lookback: "2w", role: "recent_trend_bias" },
  { id: "T4W_1H", interval: "1h", lookback: "4w", role: "main_trend_bias" },
  { id: "T6W_1H", interval: "1h", lookback: "6w", role: "stable_trend_bias" }
];

export const enabledRealtimeScanConfigs = [
  "T1H_1M",
  "T3D_15M",
  "T5D_15M",
  "T2W_1H",
  "T4W_1H",
  "T6W_1H"
];

export const thresholds = {
  m15: { targetPct: 0.02, maxDrawdownPct: -0.015, minRiskReward: 1.5 },
  h1: { targetPct: 0.05, maxDrawdownPct: -0.035, minRiskReward: 1.5 }
};
