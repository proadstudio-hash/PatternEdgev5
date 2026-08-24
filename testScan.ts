import { runEnsembleScan } from "./server/engine/ensembleRunner.js";
runEnsembleScan(["TSLA"]).then(() => console.log("Done")).catch(console.error);
