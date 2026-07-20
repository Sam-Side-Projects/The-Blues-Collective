import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";

export const alt = "A Chelsea transfer rebuild on The Blues Collective";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type MovePlayer = { name: string; position: string; value: number };

/**
 * The picture people see when a rebuild link is shared: who's in, who's out,
 * and the net spend. Fees shown are fan-proposed, and the card says so.
 * Flexbox only here — CSS grid isn't supported by the image generator.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let title = "My rebuild";
  let who = "fan";
  let net = 0;
  let incoming: MovePlayer[] = [];
  let outgoing: MovePlayer[] = [];

  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("rebuilds")
      .select(
        `title, moves, net, owner_profile:profiles!rebuilds_owner_fkey(username)`
      )
      .eq("id", id)
      .maybeSingle<{
        title: string;
        moves: {
          sold: MovePlayer[];
          loaned_out: MovePlayer[];
          bought: MovePlayer[];
          loaned_in: MovePlayer[];
        };
        net: number;
        owner_profile: { username: string } | null;
      }>();
    if (data) {
      title = data.title || "My rebuild";
      who = data.owner_profile?.username ?? "fan";
      net = data.net ?? 0;
      incoming = [...(data.moves?.bought ?? []), ...(data.moves?.loaned_in ?? [])];
      outgoing = [...(data.moves?.sold ?? []), ...(data.moves?.loaned_out ?? [])];
    }
  } catch {
    // Fall through to a generic card rather than breaking the preview.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#10265f",
          padding: 50,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#c9d6f5",
            letterSpacing: 1,
          }}
        >
          THE BLUES COLLECTIVE
        </div>

        <div
          style={{
            fontSize: 54,
            fontWeight: 800,
            color: "#ffffff",
            marginTop: 14,
            lineHeight: 1.1,
          }}
        >
          {title.length > 38 ? `${title.slice(0, 38)}…` : title}
        </div>

        {/* Single string children throughout: the image renderer counts each
            interpolation as a separate child and then demands display:flex. */}
        <div style={{ fontSize: 26, color: "#c9d6f5", marginTop: 10 }}>
          {/* A negative net means they raised more than they spent — say that
              plainly instead of printing an awkward "€-93m". */}
          {net < 0
            ? `by @${who} · net raised €${Math.abs(net)}m`
            : `by @${who} · net spend €${net}m`}
        </div>

        <div style={{ display: "flex", flex: 1, marginTop: 28, gap: 30 }}>
          <MoveColumn heading="IN" colour="#4ade80" players={incoming} />
          <MoveColumn heading="OUT" colour="#f87171" players={outgoing} />
        </div>

        <div style={{ fontSize: 19, color: "#8fa5d8" }}>
          Transfer fees are proposed by fans, not real valuations.
        </div>
      </div>
    ),
    { ...size }
  );
}

function MoveColumn({
  heading,
  colour,
  players,
}: {
  heading: string;
  colour: string;
  players: MovePlayer[];
}) {
  const shown = players.slice(0, 5);
  const extra = players.length - shown.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: colour }}>
        {`${heading} (${players.length})`}
      </div>
      {shown.length === 0 ? (
        <div style={{ fontSize: 24, color: "#8fa5d8", marginTop: 10 }}>None</div>
      ) : (
        shown.map((p) => (
          <div
            key={p.name}
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 10,
              fontSize: 25,
              color: "#ffffff",
            }}
          >
            <div style={{ width: 62, color: "#8fa5d8", fontSize: 20 }}>
              {p.position}
            </div>
            <div style={{ flex: 1 }}>
              {p.name.length > 17 ? `${p.name.slice(0, 17)}…` : p.name}
            </div>
            <div style={{ color: "#c9d6f5", fontSize: 21 }}>{`€${p.value}m`}</div>
          </div>
        ))
      )}
      {extra > 0 && (
        <div style={{ fontSize: 21, color: "#8fa5d8", marginTop: 8 }}>
          {`+${extra} more`}
        </div>
      )}
    </div>
  );
}
