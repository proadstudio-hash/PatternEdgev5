export interface OHLCV {
  symbol: string;
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ScannerResult {
  date: string;
  symbol: string;
  setup_name: string;
  score: number;
  classification: string;
  probability: number;
  expectancy: number;
  risk_reward: number;
  entry_price: number;
  stop_price: number;
  target_1: number;
  target_2: number;
  holding_period: string;
  sample_size: number;
  explanation: string;
  failure_reasons: string;
}
