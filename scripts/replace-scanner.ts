import fs from "fs";

function run() {
  const file = "src/pages/Scanner.tsx";
  let content = fs.readFileSync(file, "utf8");

  const startHook = 'const processedResults = useMemo(() => {';
  const endHook = '  }, [results, weights]);';
  
  const startIdx = content.indexOf(startHook);
  const endIdx = content.indexOf(endHook) + endHook.length;
  
  if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find hooks");
    return;
  }
  
  const replacement = `  const processedResults = useMemo(() => {
    return results.filter(r => {
        if (!selectedModels || selectedModels.length === 0) return true;
        
        let modelType = 'pattern'; // fallback
        const nm = r.setup_name || '';
        
        if (nm.includes('Time Series') || nm.includes('TS Multi')) {
            modelType = 'timeseries';
        } else if (nm.includes('Learning Trend') || nm.includes('LT ')) {
            modelType = 'learning_trend';
        } else if (nm.includes('Segnali')) {
            modelType = 'signals';
        } else {
            modelType = 'pattern'; 
        }
        
        return selectedModels.includes(modelType);
    }).map(r => {
      let generic = r.generic_score || 0;
      let specific = r.specific_score || 0;
      let winRate = r.winRate || 0;
      
      if (generic > 1.0) generic /= 100;
      if (specific > 1.0) specific /= 100;
      if (winRate > 1.0) winRate /= 100;

      const sampleSize = r.teaching_sampleSize || r.sample_size || 0;
      const patternsFound = r.patternsFound || 0;
      const teachingQuality = (r.teachingQuality || 0) / 100;
      const modelFitting = (r.modelFittingPerformance || 0) / 100;

      const hasProbability = r.probability !== undefined && r.probability !== null;
      const isTsOrSignals = r.setup_name?.includes('Time Series') || r.setup_name?.includes('Signals') || r.setup_name?.includes('Learning Trend');
      
      const score = (hasProbability && isTsOrSignals) ? 
        ((r.probability || 0) * 100) :
        (generic * weights.generic +
        specific * weights.specific +
        (sampleSize / 1000) * weights.sampleSize +
        winRate * weights.winRate +
        (patternsFound / 10) * weights.patternsFound +
        teachingQuality * weights.teachingQuality +
        modelFitting * weights.modelFitting);

      return {
        ...r,
        finalScore: score,
        teaching_sampleSize: sampleSize,
        winRate,
        patternsFound,
        teachingQuality: r.teachingQuality || 0,
        modelFittingPerformance: r.modelFittingPerformance || 0
      };
    });
  }, [results, weights, selectedModels]);`;

  content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
  
  fs.writeFileSync(file, content, "utf8");
  console.log("Replaced successfully!");
}

run();
