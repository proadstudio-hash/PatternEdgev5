export interface TrainingSlice {
  id: string;
  interval: '1d' | '1h' | '15m' | '5m' | '1m';
  timeframe: string;
  role: 'structural' | 'tactical' | 'intraday' | 'micro';
}

/**
 * Canonical learning grid. Intraday ranges longer than Yahoo's current retention
 * are progressively accumulated in the local archive and never deleted.
 */
export const CANONICAL_TRAINING_PLAN: TrainingSlice[] = [
  { id: '1d_2y', interval: '1d', timeframe: 'Last 2 Years', role: 'structural' },
  { id: '1d_1y', interval: '1d', timeframe: 'Last 1 Year', role: 'structural' },
  { id: '1d_6m', interval: '1d', timeframe: 'Last 6 Months', role: 'structural' },
  { id: '1h_6m', interval: '1h', timeframe: 'Last 6 Months', role: 'tactical' },
  { id: '1h_3m', interval: '1h', timeframe: 'Last 3 Months', role: 'tactical' },
  { id: '15m_3m', interval: '15m', timeframe: 'Last 3 Months', role: 'intraday' },
  { id: '15m_2w', interval: '15m', timeframe: 'Last 2 Weeks', role: 'intraday' },
  { id: '5m_2w', interval: '5m', timeframe: 'Last 2 Weeks', role: 'intraday' },
  { id: '1m_5d', interval: '1m', timeframe: 'Last 5 Days', role: 'micro' },
];

export interface LiveWindow {
  id: '1w' | '5d' | '48h' | '6h' | '1h';
  label: string;
  lookbackMs: number;
  preferredIntervals: Array<'1d' | '1h' | '15m' | '5m' | '1m'>;
}

export const LIVE_WINDOWS: LiveWindow[] = [
  { id: '1w', label: 'Last week', lookbackMs: 7 * 86400000, preferredIntervals: ['1h', '15m'] },
  { id: '5d', label: 'Last 5 days', lookbackMs: 5 * 86400000, preferredIntervals: ['1h', '15m'] },
  { id: '48h', label: 'Last 48 hours', lookbackMs: 48 * 3600000, preferredIntervals: ['15m', '5m'] },
  { id: '6h', label: 'Last 6 hours', lookbackMs: 6 * 3600000, preferredIntervals: ['5m', '1m'] },
  { id: '1h', label: 'Last 1 hour', lookbackMs: 3600000, preferredIntervals: ['1m', '5m'] },
];

export function frequencyLabel(interval: string): string {
  switch (interval) {
    case '1m': return '1 Minute';
    case '5m': return '5 Minutes';
    case '15m': return '15 Minutes';
    case '1h': return '1 Hour';
    default: return '1 Day';
  }
}
