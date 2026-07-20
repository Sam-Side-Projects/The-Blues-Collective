import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/timeAgo";
import { absoluteUrl } from "@/lib/siteUrl";
import ShareButtons from "@/components/ShareButtons";

export const dynamic = "force-dynamic";

type MovePlayer = { name: string; position: string; club: string; value: number };
type RebuildRow = {
  id: string;
  title: string;
  moves: {
    sold: MovePlayer[];
    loaned_out: MovePlayer[];
    bought: MovePlayer[];
    loaned_in: MovePlayer[];
  };
  spend: number;
  raised: number;
  net: number;
  note: string | null;
  created_at: string;
  owner_profile: { username: string } | null;
};

async function loadRebuild(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rebuilds")
    .select(
      `id, title, moves, spend, raised, net, note, created_at,
       owner_profile:profiles!rebuilds_owner_fkey(username)`
    )
    .eq("id", id)
    .maybeSingle<RebuildRow>();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rebuild = await loadRebuild(id);
  if (!rebuild) return { title: "Rebuild — The Blues Collective" };

  const who = rebuild.owner_profile?.username ?? "a fan";
  const description = `${who}'s transfer window: €${rebuild.spend}m spent, €${rebuild.raised}m raised. Fan-proposed fees, not real valuations.`;
  return {
    title: `${rebuild.title} — The Blues Collective`,
    description,
    openGraph: {
      title: rebuild.title,
      description,
      url: absoluteUrl(`/transfers/rebuilds/${id}`),
      type: "article",
    },
    twitter: { card: "summary_large_image", title: rebuild.title },
  };
}

export default async function SharedRebuildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rebuild = await loadRebuild(id);
  if (!rebuild) notFound();

  const moves = rebuild.moves ?? {
    sold: [],
    loaned_out: [],
    bought: [],
    loaned_in: [],
  };
  const who = rebuild.owner_profile?.username ?? "fan";
  const loanIn = new Set((moves.loaned_in ?? []).map((p) => p.name));
  const loanOut = new Set((moves.loaned_out ?? []).map((p) => p.name));
  const incoming = [...(moves.bought ?? []), ...(moves.loaned_in ?? [])];
  const outgoing = [...(moves.sold ?? []), ...(moves.loaned_out ?? [])];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/transfers/rebuilds"
        className="text-sm text-brand hover:underline"
      >
        ← All rebuilds
      </Link>

      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <header>
          <h1 className="text-2xl font-extrabold text-brand-dark">
            {rebuild.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            @{who} · {timeAgo(rebuild.created_at)}
          </p>
        </header>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center text-sm">
          <div>
            <div className="font-bold text-slate-800">€{rebuild.spend}m</div>
            <div className="text-xs text-slate-500">Spend</div>
          </div>
          <div>
            <div className="font-bold text-slate-800">€{rebuild.raised}m</div>
            <div className="text-xs text-slate-500">Raised</div>
          </div>
          <div>
            <div className="font-bold text-slate-800">€{rebuild.net}m</div>
            <div className="text-xs text-slate-500">Net</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <MoveColumn title="In" tone="in" players={incoming} loans={loanIn} />
          <MoveColumn title="Out" tone="out" players={outgoing} loans={loanOut} />
        </div>

        {rebuild.note && (
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            “{rebuild.note}”
          </p>
        )}

        <p className="mt-4 text-xs text-slate-400">
          Transfer fees are proposed by fans, not real valuations.
        </p>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <ShareButtons
            url={absoluteUrl(`/transfers/rebuilds/${id}`)}
            title={`${rebuild.title} — a Chelsea rebuild on The Blues Collective`}
          />
        </div>
      </article>
    </div>
  );
}

function MoveColumn({
  title,
  tone,
  players,
  loans,
}: {
  title: string;
  tone: "in" | "out";
  players: MovePlayer[];
  loans: Set<string>;
}) {
  return (
    <div>
      <div
        className={`mb-1 text-sm font-bold ${
          tone === "in" ? "text-green-700" : "text-red-600"
        }`}
      >
        {tone === "in" ? "▼ In" : "▲ Out"} ({players.length})
      </div>
      {players.length === 0 ? (
        <p className="text-sm text-slate-400">None</p>
      ) : (
        <ul className="space-y-1">
          {players.map((p) => (
            <li
              key={`${p.name}-${p.club}`}
              className="flex items-center gap-1.5 text-sm text-slate-700"
            >
              <span className="w-8 shrink-0 text-xs text-slate-400">
                {p.position}
              </span>
              <span className="flex-1 truncate">{p.name}</span>
              {loans.has(p.name) && (
                <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                  loan
                </span>
              )}
              <span className="text-xs text-slate-400">€{p.value}m</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
