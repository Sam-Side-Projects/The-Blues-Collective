import { FORMATIONS, type FormationName } from "@/lib/formations";

type SavedSlot = {
  slotId: string;
  role: string;
  playerId: number | null;
  playerName: string | null;
};

/**
 * Compact pitch preview for a posted lineup. Reads the saved slots and looks
 * up each slot's position from the formation definition.
 */
export default function MiniPitch({
  formation,
  slots,
  title,
  large = false,
}: {
  formation: string;
  slots: SavedSlot[];
  title?: string | null;
  /** Bigger tokens and readable names, for a full lineup page. */
  large?: boolean;
}) {
  const def = FORMATIONS[formation as FormationName] ?? FORMATIONS["4-3-3"];
  const byId = new Map(slots.map((s) => [s.slotId, s]));
  const tokenClass = large ? "h-9 w-9 text-[11px]" : "h-4 w-4 text-[7px]";
  const nameClass = large
    ? "mt-0.5 max-w-[86px] truncate text-[11px] font-semibold text-white"
    : "mt-px max-w-[52px] truncate text-[7px] font-medium text-white";

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between bg-brand-dark px-3 py-1.5 text-xs font-semibold text-white">
        <span>{title || "Lineup"}</span>
        <span className="rounded bg-white/15 px-1.5 py-0.5">{formation}</span>
      </div>
      <div
        className="relative mx-auto w-full"
        style={{
          aspectRatio: "68 / 90",
          background: "linear-gradient(180deg,#1a7d3a,#1f8f43,#1a7d3a)",
        }}
      >
        <div className="pointer-events-none absolute inset-1 rounded border border-white/30" />
        {def.map((slot) => {
          const filled = byId.get(slot.id);
          const top = `${100 - slot.y}%`;
          const left = `${slot.x}%`;
          return (
            <div
              key={slot.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ top, left }}
            >
              <span
                className={`flex items-center justify-center rounded-full font-bold ring-1 ring-white ${tokenClass} ${
                  filled?.playerName ? "bg-brand text-white" : "bg-white/70 text-slate-500"
                }`}
              >
                {slot.label.slice(0, 2)}
              </span>
              <span className={nameClass}>
                {filled?.playerName ? lastName(filled.playerName) : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function lastName(name: string): string {
  const parts = name.split(" ");
  return parts[parts.length - 1];
}
