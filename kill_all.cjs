const { execSync } = require('child_process');
try {
  console.log(execSync('killall -9 node').toString());
} catch(e) {
  console.log(e.toString());
}
