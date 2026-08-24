fetch("http://localhost:3000/api/scanner/train", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbols: ["AAPL"],
      indicators: ["sma200"],
      timeframe: "PRO AUTO",
      frequency: "1 Day",
      method: "learning_trend"
    })
}).then(r => r.json()).then(console.log);
