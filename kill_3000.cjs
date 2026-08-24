const { execSync } = require('child_process');
try {
  let out = execSync('lsof -t -i:3000').toString().trim();
  if (out) {
    console.log("PIDs listening on 3000:", out);
    const pids = out.split('\n');
    for (let pid of pids) {
       console.log("Killing", pid);
       process.kill(Number(pid), 'SIGKILL');
    }
  } else {
    console.log("No process on 3000");
  }
} catch(e) {
  console.log("Could not find or kill", e.message);
}
