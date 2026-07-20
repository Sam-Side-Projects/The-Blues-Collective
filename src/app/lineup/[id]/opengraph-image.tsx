import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { FORMATIONS, type FormationName } from "@/lib/formations";

export const alt = "A Chelsea XI on The Blues Collective";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type SavedSlot = {
  slotId: string;
  playerName: string | null;
};

function lastName(name: string): string {
  const parts = name.trim().split(" ");
  return parts[parts.length - 1];
}

/**
 * The picture people see when a lineup link is shared. Matches the downloadable
 * PNG card: navy panel, green pitch, watermark. Built with Next.js's own image
 * generation, so it costs nothing.
 *
 * Note: only flexbox works here (no CSS grid), and every element with more than
 * one child needs display:flex.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let title = "My XI";
  let formation = "4-3-3";
  let who = "fan";
  let slots: SavedSlot[] = [];

  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("lineups")
      .select(
        `title, formation, slots, owner_profile:profiles!lineups_owner_fkey(username)`
      )
      .eq("id", id)
      .maybeSingle<{
        title: string | null;
        formation: string;
        slots: SavedSlot[];
        owner_profile: { username: string } | null;
      }>();
    if (data) {
      title = data.title || "My XI";
      formation = data.formation || "4-3-3";
      who = data.owner_profile?.username ?? "fan";
      slots = Array.isArray(data.slots) ? data.slots : [];
    }
  } catch {
    // Fall through to the generic card rather than failing the whole preview.
  }

  const def = FORMATIONS[formation as FormationName] ?? FORMATIONS["4-3-3"];
  const byId = new Map(slots.map((s) => [s.slotId, s]));

  const PITCH_W = 400;
  const PITCH_H = 530;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#10265f",
          padding: 50,
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: title + credit */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            paddingRight: 40,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#c9d6f5",
                letterSpacing: 1,
              }}
            >
              THE BLUES COLLECTIVE
            </div>
            <div
              style={{
                fontSize: 62,
                fontWeight: 800,
                color: "#ffffff",
                marginTop: 22,
                lineHeight: 1.1,
              }}
            >
              {title.length > 42 ? `${title.slice(0, 42)}…` : title}
            </div>
            <div style={{ display: "flex", marginTop: 26 }}>
              <div
                style={{
                  display: "flex",
                  backgroundColor: "#1e40af",
                  color: "#ffffff",
                  fontSize: 30,
                  fontWeight: 700,
                  padding: "8px 22px",
                  borderRadius: 10,
                }}
              >
                {formation}
              </div>
            </div>
            {/* Single string child on purpose: the image renderer treats
                "by @{who}" as two children and demands display:flex. */}
            <div style={{ fontSize: 30, color: "#c9d6f5", marginTop: 26 }}>
              {`by @${who}`}
            </div>
          </div>

          <div style={{ fontSize: 20, color: "#8fa5d8" }}>
            Unofficial fan project. Not affiliated with Chelsea FC.
          </div>
        </div>

        {/* Right: the pitch */}
        <div
          style={{
            display: "flex",
            position: "relative",
            width: PITCH_W,
            height: PITCH_H,
            backgroundColor: "#1f8f43",
            borderRadius: 14,
            border: "3px solid rgba(255,255,255,0.35)",
          }}
        >
          {def.map((slot) => {
            const filled = byId.get(slot.id);
            const name = filled?.playerName ? lastName(filled.playerName) : "";
            // y=100 is the attacking end, so flip it to draw upwards.
            const top = ((100 - slot.y) / 100) * (PITCH_H - 70) + 18;
            const left = (slot.x / 100) * (PITCH_W - 70) + 10;
            return (
              <div
                key={slot.id}
                style={{
                  position: "absolute",
                  top,
                  left,
                  width: 60,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: name ? "#1e40af" : "rgba(255,255,255,0.75)",
                    color: name ? "#ffffff" : "#475569",
                    fontSize: 13,
                    fontWeight: 700,
                    border: "2px solid #ffffff",
                  }}
                >
                  {slot.label.slice(0, 3)}
                </div>
                {name ? (
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#ffffff",
                      textAlign: "center",
                    }}
                  >
                    {name.length > 9 ? `${name.slice(0, 9)}…` : name}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    ),
    { ...size }
  );
}
