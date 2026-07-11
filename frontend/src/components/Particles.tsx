import { useMemo } from "react";
export default function Particles({ count = 20 }: { count?: number }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i, left: Math.random() * 100, top: Math.random() * 100,
    size: Math.random() * 2.5 + 1.5, duration: Math.random() * 10 + 6, delay: Math.random() * 6,
    color: i % 3 === 0 ? "rgba(255,215,0,0.35)" : i % 3 === 1 ? "rgba(178,34,34,0.22)" : "rgba(255,255,255,0.2)",
  })), [count]);
  return (
    <div className="particles-field">
      {particles.map(p => (
        <div key={p.id} className="particle" style={{
          left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size,
          background: p.color, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
        }} />
      ))}
    </div>
  );
}
