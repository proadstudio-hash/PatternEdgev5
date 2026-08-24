const { execSync } = require('child_process');
try {
  console.log(execSync('lsof -i :3000').toString());
} catch(e) { console.log(e.toString()); }
