import { runEnsembleTraining } from "./server/engine/ensembleRunner.js";
runEnsembleTraining(["TSLA"]).then(() => console.log("Done")).catch(console.error);
