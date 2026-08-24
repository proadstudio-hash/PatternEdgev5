const { execSync } = require('child_process');
try {
  execSync('kill -9 3179 3190 3202 3208 3912 3923 3935');
} catch(e) {}
