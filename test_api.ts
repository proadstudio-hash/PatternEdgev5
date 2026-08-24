async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/quotes?symbols=AAPL');
    const json = await res.json();
    console.log(json);
  } catch(e) {
    console.error(e);
  }
}
test();
