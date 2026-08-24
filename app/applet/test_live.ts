async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/teaching/live_signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edges: [{master: 'NVDA', slave: 'AAPL', type: 'LEAD', probUp: 60, probDown: 40}], lookbackHours: 24 })
    });
    console.log(await res.text());
  } catch(e) { console.error(e); }
}
test();
