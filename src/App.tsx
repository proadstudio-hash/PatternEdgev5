import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Scanner } from './pages/Scanner';
import { TickerDetail } from './pages/TickerDetail';
import { BacktestLab } from './pages/BacktestLab';
import { TeachingMode } from './pages/TeachingMode';
import { RealTimeMonitor } from './pages/RealTimeMonitor';
import { LorisModel } from './pages/LorisModel';
import { ShortTermStrategy } from './pages/ShortTermStrategy';
import { ForexLiquidityPage } from './pages/ForexLiquidityPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="scanner" element={<Scanner />} />
        <Route path="loris" element={<LorisModel />} />
        <Route path="ticker/:symbol" element={<TickerDetail />} />
        <Route path="backtest" element={<BacktestLab />} />
        <Route path="teaching" element={<TeachingMode />} />
        <Route path="monitor" element={<RealTimeMonitor />} />
        <Route path="forex-liquidity" element={<ForexLiquidityPage />} />
        <Route path="short-term" element={<ShortTermStrategy />} />
        <Route path="settings" element={<div className="p-8 text-slate-400">Settings under construction...</div>} />
      </Route>
    </Routes>
  );
}
