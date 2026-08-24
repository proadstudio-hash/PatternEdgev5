const child_process = require('child_process');
try {
  const result = child_process.execSync('npx -y pm2 list || true; ps aux | grep -i vite || true; ps aux | grep -i node || true; ps aux | grep -i tsx || true').toString();
  console.log(result);
} catch(e) {
  console.log(e.toString());
}
