export interface OrderEntry {
  price: number;
  quantity: number;
  total: number; // Cumulative sum up to this point (for depth visualization)
}

export interface OrderBookSnapshot {
  timestamp: number;
  midPrice: number;
  bids: OrderEntry[]; // Sorted high to low
  asks: OrderEntry[]; // Sorted low to high
}

export interface ViewState {
  mode: '3D' | '2D';
  selectedSnapshot: OrderBookSnapshot | null;
}
