import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { OrderBookSnapshot } from '../types';

interface TwoDepthChartProps {
  snapshot: OrderBookSnapshot;
  onClose: () => void;
}

export const TwoDepthChart: React.FC<TwoDepthChartProps> = ({ snapshot, onClose }) => {
  // Transform data for Recharts
  // We need a single array. Bids need to be reversed to meet at the middle.
  
  const bidData = [...snapshot.bids].sort((a,b) => a.price - b.price).map(b => ({
    price: b.price,
    bidTotal: b.total,
    askTotal: null,
  }));

  const askData = snapshot.asks.map(a => ({
    price: a.price,
    bidTotal: null,
    askTotal: a.total,
  }));

  const data = [...bidData, ...askData];

  const minPrice = bidData[0]?.price || 0;
  const maxPrice = askData[askData.length - 1]?.price || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl h-[500px] p-6 shadow-2xl relative flex flex-col">
        
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Depth Snapshot</h2>
            <p className="text-slate-400 text-sm">
              Time: {new Date(snapshot.timestamp).toLocaleTimeString()} • Mid: ${snapshot.midPrice.toFixed(2)}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Close View
          </button>
        </div>

        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorBid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorAsk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="price" 
                stroke="#94a3b8" 
                tickFormatter={(val) => val.toFixed(0)} 
                domain={[minPrice, maxPrice]}
                type="number"
              />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                labelFormatter={(label) => `Price: $${Number(label).toFixed(2)}`}
              />
              <Area 
                type="stepAfter" 
                dataKey="bidTotal" 
                stroke="#10b981" 
                fillOpacity={1} 
                fill="url(#colorBid)" 
                name="Bid Volume"
                isAnimationActive={false}
              />
              <Area 
                type="step" 
                dataKey="askTotal" 
                stroke="#f43f5e" 
                fillOpacity={1} 
                fill="url(#colorAsk)" 
                name="Ask Volume"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
