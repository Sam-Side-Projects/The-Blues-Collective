"use client";

import { useCallback, useRef, useState } from "react";
import { verdict, POINTS_TO_BEAT } from "@/lib/game95";
import { postCardToShed } from "./weekly/actions";

export type CardPick = {
  slot: string;
  name: string;
  season: string;
  price: number;
};

/**
 * Draws a shareable results card on a canvas and lets the player download it
 * as a PNG or post it to The Shed. Nothing is shared until the player clicks.
 */
export default function ShareCard({
  picks,
  projectedPoints,
  weekText,
  canPost,
}: {
  picks: CardPick[];
  projectedPoints: number;
  weekText: string;
  canPost: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState("");

  const v = verdict(projectedPoints);

  /** Render the card onto the canvas and return it. */
  const draw = useCallback((): HTMLCanvasElement | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background (royal blue).
    ctx.fillStyle = "#10265f";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0b1c48";
    ctx.fillRect(0, 0, W, 150);

    // Title.
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 62px system-ui, sans-serif";
    ctx.fillText("The 95-Point Game", W / 2, 100);

    // Big score.
    ctx.fillStyle = v.beat ? "#fbbf24" : "#ffffff";
    ctx.font = "bold 200px system-ui, sans-serif";
    ctx.fillText(String(projectedPoints), W / 2, 400);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "500 34px system-ui, sans-serif";
    ctx.fillText("projected league points", W / 2, 450);

    // Verdict.
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.fillText(v.headline, W / 2, 530);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.fillText(`Benchmark: ${POINTS_TO_BEAT} pts — Chelsea 2004-05`, W / 2, 575);

    // Six picks.
    ctx.textAlign = "left";
    let y = 660;
    for (const p of picks) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 30px system-ui, sans-serif";
      ctx.fillText(p.slot.padEnd(5), 120, y);
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 32px system-ui, sans-serif";
      ctx.fillText(p.name, 230, y);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 26px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${p.season} · £${p.price}m`, W - 120, y);
      ctx.textAlign = "left";
      y += 58;
    }

    // Footer / watermark.
    ctx.textAlign = "center";
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.fillText("The Blue Collective", W / 2, 1010);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 26px system-ui, sans-serif";
    ctx.fillText(weekText, W / 2, 1050);

    return canvas;
  }, [picks, projectedPoints, v, weekText]);

  const download = useCallback(() => {
    const canvas = draw();
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "95-point-game.png";
    a.click();
  }, [draw]);

  const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

  const post = useCallback(async () => {
    const canvas = draw();
    if (!canvas) return;
    setPosting(true);
    setMsg("");
    const blob = await toBlob(canvas);
    if (!blob) {
      setPosting(false);
      setMsg("Could not create the image. Try Download instead.");
      return;
    }
    const fd = new FormData();
    fd.append("card", new File([blob], "95-point-game.png", { type: "image/png" }));
    fd.append(
      "body",
      `${v.headline} My 95-Point Game team scored ${projectedPoints} projected points. 🔵`
    );
    const res = await postCardToShed(fd);
    setPosting(false);
    setMsg(res.message);
  }, [draw, projectedPoints, v.headline]);

  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-amber-300">
        Share your card
      </h3>
      {/* Off-screen canvas used only to generate the PNG. */}
      <canvas ref={canvasRef} className="hidden" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={download}
          className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-brand-dark hover:bg-amber-300"
        >
          Download PNG
        </button>
        {canPost && (
          <button
            onClick={post}
            disabled={posting}
            className="rounded-xl border border-amber-400/60 px-5 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-60"
          >
            {posting ? "Posting…" : "Post to The Shed"}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-amber-200">{msg}</p>}
      {!canPost && (
        <p className="mt-2 text-xs text-slate-400">
          Log in to post your card to The Shed. You can still download it.
        </p>
      )}
    </div>
  );
}
