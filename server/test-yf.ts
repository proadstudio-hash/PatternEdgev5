import { analyzeLeadLagNetwork } from './engine/networkTeaching.js';

async function run() {
    console.log("1d 3m");
    let res = await analyzeLeadLagNetwork({ timeRange: '3m', frequency: '1d' });
    console.log("1d 3m masters:", res.masters.length);

    console.log("1d 6m");
    res = await analyzeLeadLagNetwork({ timeRange: '6m', frequency: '1d' });
    console.log("1d 6m masters:", res.masters.length);

    console.log("1d 1y");
    res = await analyzeLeadLagNetwork({ timeRange: '1y', frequency: '1d' });
    console.log("1d 1y masters:", res.masters.length);

    console.log("1d 2y");
    res = await analyzeLeadLagNetwork({ timeRange: '2y', frequency: '1d' });
    console.log("1d 2y masters:", res.masters.length);

    console.log("15m 3m");
    res = await analyzeLeadLagNetwork({ timeRange: '3m', frequency: '15m' });
    console.log("15m 3m masters:", res.masters.length);

    console.log("15m 6m");
    res = await analyzeLeadLagNetwork({ timeRange: '6m', frequency: '15m' });
    console.log("15m 6m masters:", res.masters.length);
}

run();
