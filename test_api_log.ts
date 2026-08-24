import { spawn } from 'child_process';
const server = spawn('node', ['dist/server.cjs']);
let killed = false;
server.stdout.on('data', (d) => console.log('STDOUT:', d.toString()));
server.stderr.on('data', (d) => console.log('STDERR:', d.toString()));
setTimeout(() => {
   fetch('http://localhost:3000/api/quotes?symbols=AAPL')
     .then(r => r.json())
     .then(j => { console.log('API:', j); if(!killed){server.kill(); killed=true;} })
     .catch(e => { console.error('API_ERR:', e); if(!killed){server.kill(); killed=true;} });
}, 3000);
