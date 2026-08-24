const child_process = require('child_process');

try {
  const output = child_process.execSync('ps aux | grep node').toString();
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.includes('dist/server.cjs')) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[1], 10);
      if (pid) {
        console.log("Killing PID", pid);
        try { process.kill(pid, 'SIGKILL'); } catch(e) {}
      }
    }
  }
} catch(e) { console.error(e); }
