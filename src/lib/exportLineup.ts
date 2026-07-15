import type { FormationSlot } from "./formations";

type ExportSlot = FormationSlot & {
  playerName: string | null;
  shirtNumber: number | null;
};

/**
 * Renders the lineup to an off-screen <canvas> and triggers a PNG download.
 * Runs entirely in the browser — no server or paid service involved.
 */
export async function exportLineupPng(input: {
  formation: string;
  title: string;
  slots: ExportSlot[];
}): Promise<void> {
  const W = 680;
  const H = 1050;
  const headerH = 90;
  const footerH = 60;
  const pitchTop = headerH;
  const pitchH = H - headerH - footerH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // --- Header ---
  ctx.fillStyle = "#10265f";
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px Arial";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("The Blues Collective", 24, 34);
  ctx.font = "18px Arial";
  ctx.fillStyle = "#c9d6f5";
  ctx.fillText(`${input.title}  ·  ${input.formation}`, 24, 66);

  // --- Pitch background ---
  const grad = ctx.createLinearGradient(0, pitchTop, 0, pitchTop + pitchH);
  grad.addColorStop(0, "#1a7d3a");
  grad.addColorStop(0.5, "#1f8f43");
  grad.addColorStop(1, "#1a7d3a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, pitchTop, W, pitchH);

  // Pitch markings
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(16, pitchTop + 16, W - 32, pitchH - 32);
  ctx.beginPath();
  ctx.arc(W / 2, pitchTop + pitchH / 2, 70, 0, Math.PI * 2);
  ctx.stroke();

  // --- Watermark (diagonal, semi-transparent) ---
  ctx.save();
  ctx.translate(W / 2, pitchTop + pitchH / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px Arial";
  ctx.textAlign = "center";
  ctx.fillText("The Blue Collective", 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;

  // --- Players ---
  for (const s of input.slots) {
    const cx = 16 + (s.x / 100) * (W - 32);
    // Flip y so attack (y=100) is near the top of the pitch area.
    const cy = pitchTop + 16 + ((100 - s.y) / 100) * (pitchH - 32);

    // Token circle
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = s.playerName ? "#1e40af" : "rgba(255,255,255,0.75)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Number or slot label inside token
    ctx.fillStyle = s.playerName ? "#ffffff" : "#475569";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const inside = s.playerName
      ? s.shirtNumber != null
        ? String(s.shirtNumber)
        : s.label
      : s.label;
    ctx.fillText(inside, cx, cy);

    // Name label below
    const label = s.playerName ? lastName(s.playerName) : "—";
    ctx.font = "bold 14px Arial";
    const textW = ctx.measureText(label).width + 12;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    roundRect(ctx, cx - textW / 2, cy + 26, textW, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, cx, cy + 36);
  }

  // --- Footer disclaimer ---
  ctx.fillStyle = "#10265f";
  ctx.fillRect(0, H - footerH, W, footerH);
  ctx.fillStyle = "#c9d6f5";
  ctx.font = "13px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "Unofficial fan project. Not affiliated with Chelsea FC.",
    W / 2,
    H - footerH / 2
  );

  // --- Trigger download ---
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `blues-collective-lineup-${input.formation}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts[parts.length - 1];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
