import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { OrderBookSnapshot } from '../types';
import { Text } from '@react-three/drei';

interface CanyonSceneProps {
  history: OrderBookSnapshot[];
  onSelectSlice: (snapshot: OrderBookSnapshot) => void;
}

// Visual Scaling Constants
const Z_SPACING = 0.8; 
const BAR_DEPTH = 0.9; 

// X_SCALE:
// Bucket size is $2.
// We want a $2 step to occupy exactly 0.1 units in world space?
// If X_SCALE is 0.05, then $2 * 0.05 = 0.1.
const X_SCALE = 0.05; 

// Y_SCALE: Adjusted for the aggregated volume
const Y_SCALE = 0.05; 

// BAR_WIDTH:
// With X_SCALE 0.05 and $2 buckets, the center-to-center distance is 0.1.
// We set width to 0.12 to ensure they slightly overlap, removing any gaps.
const BAR_WIDTH = 0.12; 

// TIMING CONSTANTS (Must match App.tsx TICK_RATE)
const TICK_MS = 200;
const SLICES_PER_SEC = 1000 / TICK_MS; // 5 slices per second
const Z_PER_SEC = SLICES_PER_SEC * Z_SPACING; // Distance per second

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

export const CanyonScene: React.FC<CanyonSceneProps> = ({ history, onSelectSlice }) => {
  const bidsMeshRef = useRef<THREE.InstancedMesh>(null);
  const asksMeshRef = useRef<THREE.InstancedMesh>(null);
  
  const DISPLAY_LIMIT = 100;
  // We use 60 buckets per side from marketService
  const DEPTH_PER_SIDE = 60; 
  const MAX_INSTANCES = DISPLAY_LIMIT * DEPTH_PER_SIDE;

  const latestSnapshot = history[history.length - 1];
  // Anchor the view to the latest midPrice (Center Lock)
  const centerPrice = latestSnapshot?.midPrice || 0;

  // Calculate layout positions
  useEffect(() => {
    if (!bidsMeshRef.current || !asksMeshRef.current || history.length === 0) return;

    let bidIdx = 0;
    let askIdx = 0;

    // Iterate backwards from latest (front) to oldest (back)
    const displayHistory = history.slice(-DISPLAY_LIMIT).reverse();

    displayHistory.forEach((snapshot, timeIndex) => {
      const zPos = timeIndex * Z_SPACING;
      
      // Age Factor: 0 (New/Front) to 1 (Old/Back)
      const ageFactor = timeIndex / DISPLAY_LIMIT; 
      
      // IMPROVED FADE: Use a power curve (squared) to make the drop-off faster and more dramatic
      // 1.0 at the front, dropping to nearly 0 at the back
      const fade = Math.max(0.05, Math.pow(1.0 - ageFactor, 2.5)); 

      // DYNAMIC SHIFT:
      // Calculate how much this snapshot's price differs from the current center.
      // If snapshot price (e.g. 90) < current center (100), shift is -10 units.
      // This makes the canyon "curve" to follow the price history.
      const priceDiff = snapshot.midPrice - centerPrice;
      const xShift = priceDiff * X_SCALE;

      // --- Process Bids (Left side, Green) ---
      // Note: In aggregation, index 0 is closest to mid, index 59 is furthest
      snapshot.bids.forEach((bid, i) => {
        if (bidIdx >= MAX_INSTANCES) return;

        // Visual X Position
        // Index 0 is close to mid. (i * 2.0 * X_SCALE) expands outwards to the left.
        // Shift left by fixed gap (0.2)
        // Apply dynamic xShift to move the whole row based on historical price
        const xPos = - (i * 2.0 * X_SCALE) - 0.2 + xShift; 

        // HEIGHT = Cumulative Total
        const height = Math.max(0.1, bid.total * Y_SCALE);
        
        tempObject.position.set(xPos, height / 2, -zPos);
        tempObject.scale.set(1, height, 1); 
        tempObject.updateMatrix();
        
        bidsMeshRef.current!.setMatrixAt(bidIdx, tempObject.matrix);
        
        // Color Logic: Height-based luminance + Distance Fade
        const intensity = Math.min(0.6, bid.total * 0.002); 

        // Emerald/Teal Gradients
        // Hue 0.45 (Teal). Saturation varies slightly. Lightness fades aggressively.
        tempColor.setHSL(0.45, 0.8 + intensity * 0.2, (0.4 + intensity * 0.3) * fade);
        bidsMeshRef.current!.setColorAt(bidIdx, tempColor);

        bidIdx++;
      });

      // --- Process Asks (Right side, Red) ---
      snapshot.asks.forEach((ask, i) => {
        if (askIdx >= MAX_INSTANCES) return;

        // Expands outwards to the right.
        // Apply dynamic xShift
        const xPos = (i * 2.0 * X_SCALE) + 0.2 + xShift;

        const height = Math.max(0.1, ask.total * Y_SCALE);

        tempObject.position.set(xPos, height / 2, -zPos);
        tempObject.scale.set(1, height, 1);
        tempObject.updateMatrix();

        asksMeshRef.current!.setMatrixAt(askIdx, tempObject.matrix);

        // Rose/Red Gradients
        const intensity = Math.min(0.6, ask.total * 0.002);

        // Hue 0.96 (Red/Rose). Saturation varies. Lightness fades aggressively.
        tempColor.setHSL(0.96, 0.8 + intensity * 0.2, (0.5 + intensity * 0.2) * fade);
        asksMeshRef.current!.setColorAt(askIdx, tempColor);

        askIdx++;
      });
    });

    // Hide unused instances
    for (let i = bidIdx; i < MAX_INSTANCES; i++) {
      tempObject.scale.set(0, 0, 0);
      tempObject.updateMatrix();
      bidsMeshRef.current!.setMatrixAt(i, tempObject.matrix);
    }
    for (let i = askIdx; i < MAX_INSTANCES; i++) {
      tempObject.scale.set(0, 0, 0);
      tempObject.updateMatrix();
      asksMeshRef.current!.setMatrixAt(i, tempObject.matrix);
    }

    bidsMeshRef.current.instanceMatrix.needsUpdate = true;
    if (bidsMeshRef.current.instanceColor) bidsMeshRef.current.instanceColor.needsUpdate = true;

    asksMeshRef.current.instanceMatrix.needsUpdate = true;
    if (asksMeshRef.current.instanceColor) asksMeshRef.current.instanceColor.needsUpdate = true;

  }, [history, centerPrice]);


  const handleClick = (e: any) => {
    const z = e.point.z;
    const timeIndex = Math.abs(Math.round(z / Z_SPACING));
    const reverseHistory = history.slice(-DISPLAY_LIMIT).reverse();
    if (reverseHistory[timeIndex]) {
      onSelectSlice(reverseHistory[timeIndex]);
    }
  };

  // Generate Price Labels
  const PriceLabels = useMemo(() => {
    if (!centerPrice) return null;
    
    // We are now showing a range of hundreds of dollars. 
    const steps = [
      { offset: -120, label: '-$120' },
      { offset: -80, label: '-$80' },
      { offset: -40, label: '-$40' },
      { offset: 0, label: `$${centerPrice.toFixed(0)}` },
      { offset: 40, label: '+$40' },
      { offset: 80, label: '+$80' },
      { offset: 120, label: '+$120' },
    ];

    return (
      <group position={[0, 0.1, 2]}>
        {steps.map((step, i) => {
          
          const gap = step.offset === 0 ? 0 : (step.offset > 0 ? 0.2 : -0.2);
          const xPos = (step.offset * X_SCALE) + gap;

          return (
            <group key={i} position={[xPos, 0, 0]}>
              <mesh position={[0, 0, -1]}>
                <boxGeometry args={[0.1, 0.1, 0.5]} />
                <meshBasicMaterial color="#64748b" />
              </mesh>
              <Text
                position={[0, 0, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.5}
                color="#94a3b8"
                anchorX="center"
                anchorY="top"
              >
                {step.offset === 0 ? step.label : `${(centerPrice + step.offset).toFixed(0)}`}
              </Text>
            </group>
          )
        })}
      </group>
    );
  }, [centerPrice]);

  // Generate Time Ruler (Z-axis)
  const TimeRuler = useMemo(() => {
    // Markers for: Now, 3s, 5s, 10s, 20s
    const timeMarkers = [0, 3, 5, 10, 20];
    const xPosition = -8.5; // Place to the left of the buy wall

    return (
      <group position={[xPosition, 0, 0]}>
        {timeMarkers.map((seconds) => {
          const zPos = - (seconds * Z_PER_SEC);
          return (
            <group key={seconds} position={[0, 0, zPos]}>
              {/* Tick Mark */}
              <mesh position={[0.5, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.8, 0.05]} />
                <meshBasicMaterial color="#475569" />
              </mesh>
              {/* Label */}
              <Text
                position={[-0.2, 0.1, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.6}
                color="#64748b"
                anchorX="right"
                anchorY="middle"
              >
                {seconds === 0 ? 'Now' : `-${seconds}s`}
              </Text>
            </group>
          );
        })}
        {/* Long guide line along Z */}
        <mesh position={[0.5, 0.05, -40]} rotation={[-Math.PI / 2, 0, 0]}>
           <planeGeometry args={[0.05, 80]} />
           <meshBasicMaterial color="#1e293b" />
        </mesh>
      </group>
    );
  }, []);

  // Generate Volume Ruler (Height/Y-axis)
  const VolumeRuler = useMemo(() => {
    const volSteps = [100, 200, 400, 600, 800, 1000];
    const xPosition = -8.5; // Same x alignment as time ruler

    return (
      <group position={[xPosition, 0, 2]}>
        {volSteps.map((vol) => {
          const yPos = vol * Y_SCALE;
          return (
            <group key={vol} position={[0, yPos, 0]}>
              {/* Tick */}
              <mesh position={[0.5, 0, 0]}>
                <boxGeometry args={[0.4, 0.05, 0.05]} />
                <meshBasicMaterial color="#475569" />
              </mesh>
              {/* Label */}
              <Text
                position={[-0.2, 0, 0]}
                fontSize={0.5}
                color="#64748b"
                anchorX="right"
                anchorY="middle"
              >
                {vol} BTC
              </Text>
            </group>
          );
        })}
        {/* Vertical Axis Line */}
        <mesh position={[0.5, 20, 0]}>
          <boxGeometry args={[0.05, 40, 0.05]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>
      </group>
    );
  }, []);

  return (
    <group>
      {/* Bids Instanced Mesh */}
      <instancedMesh
        ref={bidsMeshRef}
        args={[undefined, undefined, MAX_INSTANCES]}
        onClick={handleClick}
      >
        <boxGeometry args={[BAR_WIDTH, 1, BAR_DEPTH]} />
        <meshStandardMaterial
          roughness={0.2}
          metalness={0.1}
        />
      </instancedMesh>

      {/* Asks Instanced Mesh */}
      <instancedMesh
        ref={asksMeshRef}
        args={[undefined, undefined, MAX_INSTANCES]}
        onClick={handleClick}
      >
        <boxGeometry args={[BAR_WIDTH, 1, BAR_DEPTH]} />
        <meshStandardMaterial
          roughness={0.2}
          metalness={0.1}
        />
      </instancedMesh>

      {/* Floor Grid */}
      <gridHelper 
        args={[100, 50, 0x1e293b, 0x0f172a]} 
        position={[0, -0.1, -30]} 
        scale={[1, 1, 2]} 
      />
      
      {PriceLabels}
      {TimeRuler}
      {VolumeRuler}

      {/* Wall Labels - Moved further out */}
      <Text
        position={[-8, 8, -5]}
        fontSize={2}
        color="#10b981"
        anchorX="right"
        fillOpacity={0.3}
      >
        BUY WALL
      </Text>
      <Text
        position={[8, 8, -5]}
        fontSize={2}
        color="#f43f5e"
        anchorX="left"
        fillOpacity={0.3}
      >
        SELL WALL
      </Text>
    </group>
  );
};