import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { readingMinutes } from "@/lib/excerpt";

export const alt = "A Chelsea long read on The Blues Collective";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The picture people see when an article link is shared. Flexbox only —
 * the image generator doesn't support CSS grid.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let title = "Long read";
  let who = "fan";
  let minutes = 1;

  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("articles")
      .select(`title, body, author_profile:profiles!articles_author_fkey(username)`)
      .eq("id", id)
      .maybeSingle<{
        title: string;
        body: string;
        author_profile: { username: string } | null;
      }>();
    if (data) {
      title = data.title || "Long read";
      who = data.author_profile?.username ?? "fan";
      minutes = readingMinutes(data.body ?? "");
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
          justifyContent: "space-between",
          backgroundColor: "#10265f",
          padding: 60,
          fontFamily: "sans-serif",
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
            THE BLUES COLLECTIVE · LONG READ
          </div>
          <div
            style={{
              fontSize: 66,
              fontWeight: 800,
              color: "#ffffff",
              marginTop: 30,
              lineHeight: 1.15,
            }}
          >
            {title.length > 95 ? `${title.slice(0, 95)}…` : title}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Single string child: the image renderer counts each interpolation
              as a separate child and then demands display:flex. */}
          <div style={{ fontSize: 32, color: "#c9d6f5" }}>
            {`by @${who} · ${minutes} min read`}
          </div>
          <div style={{ fontSize: 20, color: "#8fa5d8", marginTop: 16 }}>
            Unofficial fan project. Not affiliated with Chelsea FC.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
