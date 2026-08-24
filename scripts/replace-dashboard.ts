import fs from "fs";

function run() {
  const file = "src/pages/Dashboard.tsx";
  let content = fs.readFileSync(file, "utf8");

  // We need to inject the performance grouping map above sortedTeachingResults 
  const hookEndIdx = content.indexOf('const sortedTeachingResults');

  const beforeJSX = content.substring(0, hookEndIdx);
  
  const injectLogic = `
  const modelPerformance = useMemo(() => {
    const models: Record<string, { count: number, winRateSum: number, teachingQSum: number, sampleSizeSum: number }> = {
       'Pattern Learning': { count: 0, winRateSum: 0, teachingQSum: 0, sampleSizeSum: 0 },
       'Time Series': { count: 0, winRateSum: 0, teachingQSum: 0, sampleSizeSum: 0 },
       'Signals': { count: 0, winRateSum: 0, teachingQSum: 0, sampleSizeSum: 0 },
       'Learning Trend': { count: 0, winRateSum: 0, teachingQSum: 0, sampleSizeSum: 0 }
    };
    
    Object.values(teachingResults).forEach((res: any) => {
        let modelName = 'Pattern Learning';
        if (res.setup_name) {
            if (res.setup_name.includes('Time Series') || res.setup_name.includes('TS Multi')) modelName = 'Time Series';
            else if (res.setup_name.includes('Learning Trend')) modelName = 'Learning Trend';
            else if (res.setup_name.includes('Segnali')) modelName = 'Signals';
            else modelName = 'Pattern Learning';
        }
        
        if (models[modelName]) {
            models[modelName].count += 1;
            models[modelName].winRateSum += (res.winRate || 0);
            models[modelName].teachingQSum += (res.teachingQuality || 0);
            models[modelName].sampleSizeSum += (res.sampleSize || 0);
        }
    });
    
    return models;
  }, [teachingResults]);
  
  `;

  content = beforeJSX + injectLogic + content.substring(hookEndIdx);
  
  // Now inject the UI below the "Teaching Results" title block.
  const titleBlockEndstr = 'View Daily Scanner\n                 </button>\n              </div>\n            </div>\n';
  const titleBlockEndIdx = content.indexOf(titleBlockEndstr) + titleBlockEndstr.length;
  
  const beforeUI = content.substring(0, titleBlockEndIdx);
  
  const injectUI = `
            {/* Model Performance Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
               {Object.entries(modelPerformance)
                  .filter(([, stats]) => stats.count > 0)
                  .map(([name, stats]) => (
                 <div key={name} className="bg-slate-800 text-white rounded-lg p-3 shadow text-sm border border-slate-700 flex flex-col justify-between">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{name}</div>
                    <div className="flex justify-between items-end">
                       <div>
                         <div className="text-2xl font-black text-emerald-400">
                           {((stats.winRateSum / stats.count) * 100).toFixed(1)}%
                         </div>
                         <div className="text-[10px] font-bold text-slate-300">AVG WIN RATE</div>
                       </div>
                       <div className="text-right">
                         <div className="text-sm font-bold text-indigo-300">
                           {(stats.teachingQSum / stats.count).toFixed(0)}%
                         </div>
                         <div className="text-[9px] font-bold text-slate-400">QUALITY</div>
                       </div>
                    </div>
                 </div>
               ))}
            </div>
`;
  
  content = beforeUI + injectUI + content.substring(titleBlockEndIdx);
  
  fs.writeFileSync(file, content, "utf8");
  console.log("Success! File replaced perfectly.");
}

run();
