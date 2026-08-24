import { spawn } from 'child_process';
const server = spawn('node', ['dist/server.cjs']);
server.stdout.on('data', (d) => console.log(d.toString()));
server.stderr.on('data', (d) => console.log(d.toString()));
setTimeout(() => {
   fetch('http://localhost:3000/api/quotes?symbols=AAPL')
     .then(r => r.json())
     .then(j => { console.log(j); server.kill(); })
     .catch(e => { console.error(e); server.kill(); });
}, 3000);
