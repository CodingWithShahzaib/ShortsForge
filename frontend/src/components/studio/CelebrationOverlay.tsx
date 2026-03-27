"use client";

import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";

const PARTICLE_COLORS = [
  "#f43f5e",
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
];

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  shape: "circle" | "square";
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 350;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size: 4 + Math.random() * 8,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      rotation: Math.random() * 720 - 360,
      shape: Math.random() > 0.5 ? "circle" : "square",
    };
  });
}

interface CelebrationOverlayProps {
  show: boolean;
  onDone?: () => void;
}

export default function CelebrationOverlay({ show, onDone }: CelebrationOverlayProps) {
  const particles = useMemo(() => makeParticles(50), []);

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => onDone?.(), 2200);
    return () => clearTimeout(timer);
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className={p.shape === "circle" ? "rounded-full" : "rounded-sm"}
              style={{
                position: "absolute",
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0, rotate: 0 }}
              animate={{
                x: p.x,
                y: p.y,
                opacity: [1, 1, 0],
                scale: [0, 1.2, 0.8],
                rotate: p.rotation,
              }}
              transition={{ duration: 2, ease: "easeOut" }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
