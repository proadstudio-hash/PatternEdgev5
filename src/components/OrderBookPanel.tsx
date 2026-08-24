import React from 'react';
import { ShieldCheck, TrendingDown, TrendingUp, AlertCircle, Layers } from 'lucide-react';

export interface OrderBookLevel {
    price: number;
    size: number;
    cumulativeSize: number;
}

export interface MarketDepth {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    supportPrice: number;
    resistancePrice: number;
    spread: number;
    midPrice: number;
}

interface OrderBookPanelProps {
    symbol: string;
    currentPrice: number;
    orderBook?: MarketDepth;
}

export const OrderBookPanel: React.FC<OrderBookPanelProps> = ({ symbol, currentPrice, orderBook }) => {
    if (!orderBook) {
        return (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 gap-2 border border-slate-100 dark:border-slate-800 text-xs">
                <AlertCircle className="w-4 h-4 text-slate-400" />
                <span>Nessun dato di profondità disponibile.</span>
            </div>
        );
    }

    const { bids, asks, supportPrice, resistancePrice, spread, midPrice } = orderBook;

    // Calculate depth volumes to represent buyer/seller skew
    const totalBidVolume = bids.reduce((acc, level) => acc + level.size, 0);
    const totalAskVolume = asks.reduce((acc, level) => acc + level.size, 0);
    const totalVolume = totalBidVolume + totalAskVolume;
    
    const bidSkewPct = totalVolume > 0 ? (totalBidVolume / totalVolume) * 100 : 50;
    const askSkewPct = totalVolume > 0 ? (totalAskVolume / totalVolume) * 100 : 50;

    const maxCumBid = bids[bids.length - 1]?.cumulativeSize || 1;
    const maxCumAsk = asks[asks.length - 1]?.cumulativeSize || 1;
    const maxCum = Math.max(maxCumBid, maxCumAsk);

    return (
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-4 shadow-sm text-left">
            {/* Header section */}
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span className="font-bold text-xs uppercase tracking-widest text-slate-700 dark:text-slate-300">
                        Portafoglio Ordini L2 & Profondità
                    </span>
                </div>
                <div className="flex gap-2">
                    <span className="text-[10px] bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-mono">
                        Spread: <span className="font-bold text-slate-700 dark:text-slate-300">${spread.toFixed(2)}</span>
                    </span>
                    <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-mono">
                        Rilevazione Real-Time
                    </span>
                </div>
            </div>

            {/* Skew ratio bar */}
            <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-emerald-600 flex items-center gap-1">
                        Acquisti: {bidSkewPct.toFixed(0)}%
                    </span>
                    <span className="text-rose-600 flex items-center gap-1">
                        Vendite: {askSkewPct.toFixed(0)}%
                    </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 flex overflow-hidden">
                    <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${bidSkewPct}%` }} />
                    <div className="bg-rose-500 transition-all duration-500" style={{ width: `${askSkewPct}%` }} />
                </div>
            </div>

            {/* Support and resistance analysis outputs */}
            <div className="grid grid-cols-2 gap-3 bg-white dark:bg-slate-800/20 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-wider flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                        Supporto L2 Chiave
                    </div>
                    <div className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                        ${supportPrice.toFixed(2)}
                    </div>
                </div>
                <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-wider flex items-center gap-1 text-right justify-end">
                        <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                        Resistenza L2 Chiave
                    </div>
                    <div className="font-mono text-sm font-black text-rose-600 dark:text-rose-400 text-right">
                        ${resistancePrice.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Level 2 order list blocks */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                {/* Buy Bids Panel */}
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800 pb-1 uppercase">
                        <span>Bid Price</span>
                        <span>Qtà</span>
                    </div>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                        {bids.map((bid, idx) => {
                            const isSupport = bid.price === supportPrice;
                            return (
                                <div 
                                    key={idx} 
                                    className={`relative flex justify-between p-1 rounded overflow-hidden text-[11px] ${
                                        isSupport 
                                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-black border-l-2 border-emerald-500' 
                                            : 'text-slate-600 dark:text-slate-400'
                                    }`}
                                >
                                    {/* Cumulative depth fill background */}
                                    <div 
                                        className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 dark:bg-emerald-500/5 transition-all duration-300 pointer-events-none" 
                                        style={{ width: `${(bid.cumulativeSize / maxCum) * 100}%` }}
                                    />
                                    <span className="relative z-10 flex items-center gap-1 font-bold">
                                        ${bid.price.toFixed(2)}
                                        {isSupport && <span className="text-[8px] bg-emerald-200/50 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300 px-1 rounded uppercase">SUPP</span>}
                                    </span>
                                    <span className="relative z-10 font-bold">{bid.size.toLocaleString()}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Sell Asks Panel */}
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800 pb-1 uppercase">
                        <span>Ask Price</span>
                        <span>Qtà</span>
                    </div>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                        {asks.map((ask, idx) => {
                            const isResistance = ask.price === resistancePrice;
                            return (
                                <div 
                                    key={idx} 
                                    className={`relative flex justify-between p-1 rounded overflow-hidden text-[11px] ${
                                        isResistance 
                                            ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 font-black border-r-2 border-rose-500' 
                                            : 'text-slate-600 dark:text-slate-400'
                                    }`}
                                >
                                    {/* Cumulative depth fill background */}
                                    <div 
                                        className="absolute left-0 top-0 bottom-0 bg-rose-500/10 dark:bg-rose-500/5 transition-all duration-300 pointer-events-none" 
                                        style={{ width: `${(ask.cumulativeSize / maxCum) * 100}%` }}
                                    />
                                    <span className="relative z-10 flex items-center gap-1 font-bold">
                                        ${ask.price.toFixed(2)}
                                        {isResistance && <span className="text-[8px] bg-rose-200/50 dark:bg-rose-800/50 text-rose-700 dark:text-rose-300 px-1 rounded uppercase">RES</span>}
                                    </span>
                                    <span className="relative z-10 font-bold">{ask.size.toLocaleString()}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-1.5 text-[9px] text-slate-400 dark:text-slate-500 italic bg-white dark:bg-slate-900/20 p-1 rounded border border-slate-100 dark:border-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Punti di supporto/resistenza calcolati in base alla massima concentrazione dei blocchi di liquidità L2.</span>
            </div>
        </div>
    );
};
