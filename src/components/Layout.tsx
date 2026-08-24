import { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BarChart2, Activity, ShieldAlert, LayoutDashboard, Settings, Network, Sparkles, Zap, Coins } from 'lucide-react';
import { cn } from '../lib/utils';

interface LayoutProps {
  children?: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const n = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
      isActive ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 bg-white shadow-sm flex flex-col z-10 flex-shrink-0">
        <div className="p-4 flex items-center gap-3 border-b border-slate-200 md:h-16 h-14">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center flex-shrink-0">
            <div className="w-4 h-4 border-2 border-white rotate-45"></div>
          </div>
          <span className="font-bold tracking-tight text-lg text-slate-900">PatternEdge</span>
        </div>
        <nav className="flex-1 p-4 flex md:flex-col flex-row gap-2 overflow-x-auto space-y-0 md:space-y-1">
          <NavLink to="/" className={n} end>
            <LayoutDashboard className="h-4 w-4" /> <span className="hidden md:inline">Home</span>
          </NavLink>
          <NavLink to="/scanner" className={n}>
             <BarChart2 className="h-4 w-4" /> <span className="hidden md:inline">Daily Scanner</span>
          </NavLink>
          <NavLink to="/loris" className={n}>
             <Sparkles className="h-4 w-4 text-emerald-500" /> <span className="hidden md:inline font-bold text-slate-800">Loris Growth Model</span>
          </NavLink>
          <NavLink to="/teaching" className={n}>
             <Network className="h-4 w-4" /> <span className="hidden md:inline">Lead/Lag Network</span>
          </NavLink>
          <NavLink to="/monitor" className={n}>
             <Activity className="h-4 w-4" /> <span className="hidden md:inline">Real-Time Monitor</span>
          </NavLink>
          <NavLink to="/forex-liquidity" className={n}>
             <Coins className="h-4 w-4 text-indigo-500" /> <span className="hidden md:inline font-bold">Forex Liquidity</span>
          </NavLink>
          <NavLink to="/short-term" className={n}>
             <Zap className="h-4 w-4 text-amber-500" /> <span className="hidden md:inline font-bold">L2 Short-Term Swing</span>
          </NavLink>
          <NavLink to="/backtest" className={n}>
             <ShieldAlert className="h-4 w-4" /> <span className="hidden md:inline">Backtest Lab</span>
          </NavLink>
          <NavLink to="/settings" className={n}>
             <Settings className="h-4 w-4" /> <span className="hidden md:inline">Settings</span>
          </NavLink>
        </nav>
        <div className="hidden md:block p-4 border-t border-slate-200 text-xs text-slate-500 space-y-2">
           <p className="font-bold uppercase tracking-widest text-[10px] text-slate-400">FINANCIAL DISCLAIMER</p>
           <p>This software does NOT provide financial advice.</p>
           <p>Educational and analytical purposes only. Historical results do not guarantee future performance.</p>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50 flex flex-col">
        <div className="flex-1 overflow-auto">
          <Outlet />
          {children}
        </div>
        
        {/* Global Status Bar */}
        <footer className="h-10 bg-white border-t border-slate-200 flex items-center justify-between px-4 md:px-8 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <div className="flex gap-4 md:gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="hidden sm:inline">DATA PROVIDERS: </span>OK
            </div>
            <div className="hidden md:block">LATENCY: 14MS</div>
            <div className="text-emerald-500">MODE: LIVE</div>
          </div>
          <div className="flex gap-4">
            <span className="text-indigo-600 hidden sm:inline">AUTO-SYNC ENABLED</span>
            <span className="hidden sm:inline">V.1.0-STABLE</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
