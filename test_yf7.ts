import * as yf from 'yahoo-finance2';
console.log(Object.keys(yf));
console.log(typeof yf.default);
if (typeof yf.default === 'function') {
  console.log("Is it a class?");
  // Try instantiating?
}
