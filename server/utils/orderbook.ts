export interface OrderBookLevel {
    price: number;
    size: number;
    cumulativeSize: number;
}

export interface MarketDepth {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    supportPrice: number;
    resistancePrice: number;
    spread: number;
    midPrice: number;
}

/**
 * Generates realistic real-time market depth / order book levels for a given stock price.
 * Calculates major support and resistance points based on heavy order block sizes.
 */
export function generateMarketDepth(currentPrice: number, symbol: string): MarketDepth {
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];
    
    // Seeded random based on symbol to keep the book structure somewhat stable
    const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const seededRandom = (localSeed: number) => {
        const x = Math.sin(localSeed) * 10000;
        return x - Math.floor(x);
    };

    let tickSize = 0.01;
    if (currentPrice > 500) tickSize = 0.50;
    else if (currentPrice > 100) tickSize = 0.10;
    else if (currentPrice > 15) tickSize = 0.05;

    const spreadPct = 0.0005 + seededRandom(seed) * 0.0005; // 0.05% - 0.1%
    const spreadValue = currentPrice * spreadPct;
    
    const bestBid = Number((currentPrice - (spreadValue / 2)).toFixed(2));
    const bestAsk = Number((currentPrice + (spreadValue / 2)).toFixed(2));

    let cumulativeBid = 0;
    let maxBidSize = 0;
    let supportPrice = bestBid;

    // Generate 10 levels of Bids (Buyers)
    for (let i = 0; i < 10; i++) {
        const bidPrice = Number((bestBid - i * tickSize).toFixed(2));
        
        // Simulating standard size vs institutional blocks
        const r = seededRandom(seed + i * 17);
        const isBlock = r < 0.20; // 20% chance of a heavy block
        const size = isBlock 
            ? Math.floor(800 + r * 2200) * 10 // heavy support cluster
            : Math.floor(50 + r * 350);

        cumulativeBid += size;
        bids.push({ price: bidPrice, size, cumulativeSize: cumulativeBid });

        if (size > maxBidSize) {
            maxBidSize = size;
            supportPrice = bidPrice;
        }
    }

    let cumulativeAsk = 0;
    let maxAskSize = 0;
    let resistancePrice = bestAsk;

    // Generate 10 levels of Asks (Sellers)
    for (let i = 0; i < 10; i++) {
        const askPrice = Number((bestAsk + i * tickSize).toFixed(2));
        
        // Simulating standard size vs institutional blocks
        const r = seededRandom(seed + i * 31 + 42);
        const isBlock = r < 0.20; // 20% chance of heavy block
        const size = isBlock 
            ? Math.floor(800 + r * 2200) * 10 // heavy resistance cluster
            : Math.floor(50 + r * 350);

        cumulativeAsk += size;
        asks.push({ price: askPrice, size, cumulativeSize: cumulativeAsk });

        if (size > maxAskSize) {
            maxAskSize = size;
            resistancePrice = askPrice;
        }
    }

    return {
        bids,
        asks,
        supportPrice,
        resistancePrice,
        spread: Number((bestAsk - bestBid).toFixed(2)),
        midPrice: Number(((bestAsk + bestBid) / 2).toFixed(2))
    };
}
