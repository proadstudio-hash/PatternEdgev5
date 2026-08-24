import { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, IChartApi, CandlestickSeries, LineSeries } from 'lightweight-charts';

export function CandlestickChart({ data }: { data: any[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#64748b',
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: '#e2e8f0',
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    const formattedData: any[] = [];
    const seenTimes = new Set<string>();

    for (const d of data) {
      if (!d?.bar?.datetime) continue;
      let timeVal = d.bar.datetime;
      if (typeof timeVal === 'string' && timeVal.includes('T')) {
        timeVal = timeVal.split('T')[0];
      }
      if (seenTimes.has(timeVal)) continue;
      seenTimes.add(timeVal);

      formattedData.push({
        time: timeVal,
        open: Number(d.bar.open),
        high: Number(d.bar.high),
        low: Number(d.bar.low),
        close: Number(d.bar.close),
      });
    }
    
    if (formattedData.length > 0) {
      candleSeries.setData(formattedData);

      // Add SMA50
      const sma50Series = chart.addSeries(LineSeries, { color: '#818cf8', lineWidth: 2 });
      const smaData: any[] = [];
      for (const d of data) {
        if (!d?.bar?.datetime || isNaN(Number(d.sma50))) continue;
        let timeVal = d.bar.datetime;
        if (typeof timeVal === 'string' && timeVal.includes('T')) {
          timeVal = timeVal.split('T')[0];
        }
        smaData.push({ time: timeVal, value: Number(d.sma50) });
      }
      // Deduplicate smaData
      const seenSmaTimes = new Set<string>();
      const cleanSmaData = smaData.filter(d => {
        if (seenSmaTimes.has(d.time)) return false;
        seenSmaTimes.add(d.time);
        return true;
      });
      if (cleanSmaData.length > 0) {
        sma50Series.setData(cleanSmaData);
      }

      chart.timeScale().fitContent();
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}

