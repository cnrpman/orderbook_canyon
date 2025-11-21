import { OrderBookSnapshot, OrderEntry } from '../types';

// Configuration
// Binance limit=1000 gives us a decent range.
// We aggregate into buckets to create the visual "wall".
const AGGREGATION_BUCKET_SIZE = 2.0; // Group orders into $2 chunks
const VISUAL_BUCKETS = 60; // How many buckets to return to the UI per side

// For Mock Data
const INITIAL_PRICE = 96000; 

/**
 * Aggregates a raw map of price->size into sorted, continuous cumulative buckets.
 * Uses a dense array approach to ensure no gaps in the X-axis.
 */
const aggregateOrders = (
  rawOrders: Map<number, number>, 
  isBid: boolean, 
  midPrice: number
): OrderEntry[] => {
  
  // 1. Initialize dense buckets (0 to VISUAL_BUCKETS-1)
  // This ensures we have a continuous wall even if there is no liquidity at a specific price step.
  const bucketVolumes = new Float64Array(VISUAL_BUCKETS).fill(0);

  // 2. Distribute Raw Volume into Buckets
  for (const [price, qty] of rawOrders) {
    // Calculate distance from midPrice
    const diff = Math.abs(price - midPrice);
    
    // Determine index
    const index = Math.floor(diff / AGGREGATION_BUCKET_SIZE);

    // Add to bucket if within range
    if (index >= 0 && index < VISUAL_BUCKETS) {
      bucketVolumes[index] += qty;
    }
  }

  // 3. Build Cumulative Result
  const result: OrderEntry[] = [];
  let cumulativeTotal = 0;

  for (let i = 0; i < VISUAL_BUCKETS; i++) {
    const qty = bucketVolumes[i];
    cumulativeTotal += qty;

    // Calculate the visual price for this bucket
    // For Bids: moving down from mid. For Asks: moving up.
    const bucketPrice = isBid 
      ? midPrice - (i * AGGREGATION_BUCKET_SIZE) 
      : midPrice + (i * AGGREGATION_BUCKET_SIZE);

    result.push({
      price: bucketPrice,
      quantity: qty,
      total: cumulativeTotal
    });
  }

  return result;
};

/**
 * Simulates an orderbook snapshot
 */
export const generateMockSnapshot = (prevSnapshot?: OrderBookSnapshot): OrderBookSnapshot => {
  const now = Date.now();
  
  let midPrice = INITIAL_PRICE;
  
  if (prevSnapshot) {
    const volatility = prevSnapshot.midPrice * 0.0005; 
    const change = (Math.random() - 0.5) * volatility;
    midPrice = prevSnapshot.midPrice + change;
  }

  const bids: OrderEntry[] = [];
  const asks: OrderEntry[] = [];

  // Generate Bids (Price decreasing)
  let currentBidVol = 0;
  for (let i = 0; i < VISUAL_BUCKETS; i++) {
    const price = midPrice - (i * AGGREGATION_BUCKET_SIZE); 
    const qty = Math.random() * 5 + (Math.random() * 10); 
    currentBidVol += qty;
    bids.push({ price, quantity: qty, total: currentBidVol });
  }

  // Generate Asks (Price increasing)
  let currentAskVol = 0;
  for (let i = 0; i < VISUAL_BUCKETS; i++) {
    const price = midPrice + (i * AGGREGATION_BUCKET_SIZE);
    const qty = Math.random() * 5 + (Math.random() * 10);
    currentAskVol += qty;
    asks.push({ price, quantity: qty, total: currentAskVol });
  }

  return {
    timestamp: now,
    midPrice,
    bids,
    asks,
  };
};

/**
 * BINANCE DIFF-DEPTH STREAM IMPLEMENTATION
 * Connects to wss://stream.binance.com:9443/ws/<symbol>@depth@100ms
 * Fetches initial snapshot from REST API to build the base book.
 */
export const subscribeToBinanceStream = (
  symbol: string, // e.g. 'BTCUSDT'
  onUpdate: (snapshot: OrderBookSnapshot) => void
) => {
  const lowerSymbol = symbol.toLowerCase();
  const wsUrl = `wss://stream.binance.com:9443/ws/${lowerSymbol}@depth@100ms`;
  const snapshotUrl = `https://api.binance.com/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=1000`;

  const ws = new WebSocket(wsUrl);

  // Local Orderbook State (Raw)
  const bidMap = new Map<number, number>();
  const askMap = new Map<number, number>();

  // Buffer for events that arrive before the snapshot
  let eventBuffer: any[] = [];
  let hasSnapshot = false;
  let lastUpdateId = 0;
  let processing = false;

  // 1. Connect WS and start buffering events
  ws.onopen = () => {
    console.log('Connected to Binance WS');
    // Once WS is open, fetch the snapshot
    fetchSnapshot();
  };

  const fetchSnapshot = async () => {
    try {
      const res = await fetch(snapshotUrl);
      const data = await res.json();
      
      // Initialize Map from Snapshot
      // Binance Snapshot format: { lastUpdateId: number, bids: [price, qty][], asks: [price, qty][] }
      
      lastUpdateId = data.lastUpdateId;

      data.bids.forEach((item: string[]) => {
        bidMap.set(parseFloat(item[0]), parseFloat(item[1]));
      });
      data.asks.forEach((item: string[]) => {
        askMap.set(parseFloat(item[0]), parseFloat(item[1]));
      });

      hasSnapshot = true;
      
      // Process Buffered Events
      // Drop any event where u <= lastUpdateId
      // The first processed event should have U <= lastUpdateId+1 AND u >= lastUpdateId+1
      const validEvents = eventBuffer.filter(e => e.u > lastUpdateId);
      
      validEvents.forEach(processEvent);
      eventBuffer = []; // Clear buffer

    } catch (err) {
      console.error("Failed to fetch Binance snapshot:", err);
    }
  };

  const processEvent = (e: any) => {
    // e.b = bids updates, e.a = asks updates
    // Update format: [ [ "price", "qty" ], ... ]
    
    if (e.b) {
      for (const [pStr, qStr] of e.b) {
        const price = parseFloat(pStr);
        const qty = parseFloat(qStr);
        if (qty === 0) bidMap.delete(price);
        else bidMap.set(price, qty);
      }
    }

    if (e.a) {
      for (const [pStr, qStr] of e.a) {
        const price = parseFloat(pStr);
        const qty = parseFloat(qStr);
        if (qty === 0) askMap.delete(price);
        else askMap.set(price, qty);
      }
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Event type 'depthUpdate'
      if (data.e === 'depthUpdate') {
        if (!hasSnapshot) {
          eventBuffer.push(data);
        } else {
          processEvent(data);
          
          // Optimization: Throttle aggregation to avoid UI stutter if messages come too fast
          if (!processing) {
            processing = true;
            requestAnimationFrame(() => {
              emitUpdate();
              processing = false;
            });
          }
        }
      }
    } catch (err) {
      console.error("Binance WS Parse Error", err);
    }
  };

  const emitUpdate = () => {
    if (bidMap.size === 0 || askMap.size === 0) return;

    // Calculate Mid Price (Best Bid + Best Ask / 2)
    let bestBid = 0;
    let bestAsk = Infinity;

    // Fast iteration for best prices
    for (const k of bidMap.keys()) {
      if (k > bestBid) bestBid = k;
    }
    for (const k of askMap.keys()) {
      if (k < bestAsk) bestAsk = k;
    }

    // Safety check for empty book
    if (bestBid === 0 || bestAsk === Infinity) return;

    const midPrice = (bestBid + bestAsk) / 2;

    const bids = aggregateOrders(bidMap, true, midPrice);
    const asks = aggregateOrders(askMap, false, midPrice);

    const snapshot: OrderBookSnapshot = {
      timestamp: Date.now(),
      midPrice,
      bids,
      asks
    };

    onUpdate(snapshot);
  };

  return () => {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  };
};
