import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, PerspectiveCamera } from '@react-three/drei';
import { generateMockSnapshot, subscribeToBinanceStream } from './services/marketService';
import { OrderBookSnapshot } from './types';
import { CanyonScene } from './components/CanyonScene';
import { TwoDepthChart } from './components/TwoDepthChart';
import { Activity, Pause, Play, RefreshCw, Layers, Wifi, WifiOff, RotateCw } from 'lucide-react';

// Config
const MAX_HISTORY = 100; // Keep more history for smoother, faster updates
const TICK_RATE = 200; // Add a new slice every 200ms (5 FPS) for smoother visual flow

const App: React.FC = () => {
  const [history, setHistory] = useState<OrderBookSnapshot[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [selectedSnapshot, setSelectedSnapshot] = useState<OrderBookSnapshot | null>(null);
  // Default to API for real-time data
  const [dataSource, setDataSource] = useState<'API' | 'MOCK'>('API');
  const [lastPrice, setLastPrice] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  
  // Refs to hold mutable data for the loop
  const latestDataRef = useRef<OrderBookSnapshot | null>(null);
  const historyRef = useRef<OrderBookSnapshot[]>([]);

  // 1. Data Source Connection (WebSocket or Mock Loop)
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let mockInterval: any;

    if (dataSource === 'API') {
      setIsConnected(false);
      // Subscribe to Binance WebSocket (BTCUSDT)
      // Using the Diff-Depth stream to get full orderbook view
      cleanup = subscribeToBinanceStream('BTCUSDT', (snapshot) => {
        latestDataRef.current = snapshot;
        setIsConnected(true);
        setLastPrice(snapshot.midPrice);
      });
    } else {
      // Mock Data Generation Loop (simulates a high-frequency stream)
      setIsConnected(true);
      mockInterval = setInterval(() => {
        const prev = latestDataRef.current || historyRef.current[historyRef.current.length - 1];
        const snapshot = generateMockSnapshot(prev);
        latestDataRef.current = snapshot;
        setLastPrice(snapshot.midPrice);
      }, 100); // Mock generates data every 100ms
    }

    return () => {
      if (cleanup) cleanup();
      if (mockInterval) clearInterval(mockInterval);
    };
  }, [dataSource]);

  // 2. App Loop (The "Tick" that creates the visual canyon slices)
  useEffect(() => {
    const tick = () => {
      if (isPaused || !latestDataRef.current) return;

      // Take the latest available data from the stream
      const snapshot = latestDataRef.current;

      // Update History
      const currentHist = historyRef.current;
      const newHistory = [...currentHist, snapshot];
      
      // Prune old history
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      
      historyRef.current = newHistory;
      setHistory(newHistory);
    };

    const intervalId = setInterval(tick, TICK_RATE);
    return () => clearInterval(intervalId);
  }, [isPaused]); // Only recreate if pause state changes

  return (
    <div className="relative w-full h-full bg-slate-950 text-white font-sans overflow-hidden">
      
      {/* 3D Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <Canvas>
          {/* Widen FOV slightly to 60 to see more of the canyon walls */}
          <PerspectiveCamera makeDefault position={[0, 15, 30]} fov={60} />
          <OrbitControls 
            enablePan={true} 
            enableZoom={true} 
            minDistance={5} 
            maxDistance={120}
            autoRotate={autoRotate && !isPaused && !selectedSnapshot}
            autoRotateSpeed={0.5}
            target={[0, 0, -10]} 
          />
          
          <ambientLight intensity={1.8} />
          <pointLight position={[10, 20, 10]} intensity={1.5} color="#ffffff" />
          {/* Adjusted lights for wider scene */}
          <pointLight position={[-30, 15, -20]} intensity={2} color="#10b981" distance={80} /> 
          <pointLight position={[30, 15, -20]} intensity={2} color="#f43f5e" distance={80} /> 
          
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          
          <CanyonScene 
            history={history} 
            onSelectSlice={(snap) => {
              setSelectedSnapshot(snap);
            }} 
          />
          
          <fog attach="fog" args={['#0f172a', 10, 150]} />
        </Canvas>
      </div>

      {/* HUD / UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 z-10 pointer-events-none">
        <div className="flex justify-between items-start">
          
          {/* Header */}
          <div className="pointer-events-auto">
            <h1 className="text-3xl font-black tracking-tighter uppercase italic bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-500 drop-shadow-sm">
              Orderbook Canyon
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`backdrop-blur px-3 py-1 rounded-full text-xs font-mono border flex items-center gap-2 transition-colors ${isConnected ? 'bg-yellow-900/30 border-yellow-700/50 text-yellow-400' : 'bg-slate-800/80 border-slate-700 text-slate-400'}`}>
                {isConnected ? <Wifi size={12} className="text-yellow-400 animate-pulse" /> : <WifiOff size={12} className="text-rose-400" />}
                {dataSource === 'API' ? 'BINANCE LIVE (FULL)' : 'SIMULATION'}
              </span>
              <span className="text-2xl font-mono font-bold">
                ${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2 pointer-events-auto">
             <button 
              onClick={() => setDataSource(prev => prev === 'API' ? 'MOCK' : 'API')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${dataSource === 'API' ? 'bg-yellow-600/20 border-yellow-500 text-yellow-400 hover:bg-yellow-600/30' : 'bg-orange-600/20 border-orange-500 text-orange-400 hover:bg-orange-600/30'}`}
            >
              <RefreshCw size={16} className={dataSource === 'API' && !isConnected ? "animate-spin" : ""} />
              {dataSource === 'API' ? 'Live Data' : 'Simulated'}
            </button>

            <button 
              onClick={() => setAutoRotate(!autoRotate)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-all ${autoRotate ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}
            >
              <RotateCw size={16} className={autoRotate ? "animate-spin-slow" : ""} />
              Rotate
            </button>

            <button 
              onClick={() => setIsPaused(!isPaused)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm font-medium transition-all"
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 max-w-xs text-xs text-slate-400 bg-slate-900/50 backdrop-blur-md p-4 rounded-xl border border-slate-800 pointer-events-auto transition-opacity opacity-80 hover:opacity-100">
          <h3 className="font-bold text-slate-200 mb-2 flex items-center gap-2">
            <Activity size={14} /> Visual Guide
          </h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-emerald-600"></div>
              <span>Buy Wall (Aggregated $2 Buckets)</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-rose-700"></div>
              <span>Sell Wall (Aggregated $2 Buckets)</span>
            </li>
            <li className="flex items-center gap-2">
              <Layers size={14} />
              <span>Height = Cumulative Volume</span>
            </li>
          </ul>
        </div>
      </div>

      {/* 2D Modal Overlay */}
      {selectedSnapshot && (
        <TwoDepthChart 
          snapshot={selectedSnapshot} 
          onClose={() => {
            setSelectedSnapshot(null);
            // No need to resume, we didn't pause
          }} 
        />
      )}

    </div>
  );
};

export default App;