"use client";

import React from "react";

export function Sparkline({ 
  data: points, 
  color, 
  height = 24, 
  width = 100, 
  className = "" 
}: { 
  data: number[]; 
  color: string; 
  height?: number; 
  width?: number;
  className?: string;
}) {
  if (!points || points.length < 2) return <div style={{ width, height }} className={`bg-white/5 rounded ${className}`} />;
  const max = Math.max(...points, 1);
  const pathPoints = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  
  return (
    <svg width={width} height={height} className={`inline-block ${className}`}>
      <polyline points={pathPoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
