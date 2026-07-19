"use client";

import { useEffect, useState } from "react";

/** Live countdown to the next weekly reset (Monday 00:00 UK). */
export default function Countdown({ targetIso }: { targetIso: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) {
        setText("New challenge ready — refresh!");
        return;
      }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setText(`${d}d ${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return <span className="font-mono tabular-nums text-amber-300">{text}</span>;
}
