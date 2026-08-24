async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/health');
    const json = await res.json();
    console.log(json);
  } catch(e) {
    console.error(e);
  }
}
test();
