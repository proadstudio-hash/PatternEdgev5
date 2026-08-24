const { execSync } = require('child_process');
try {
  let out = execSync('ps aux | grep node').toString().trim();
  console.log(out);
  // parse and kill all node processes except ourself
} catch(e) { }
