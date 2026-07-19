import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { WINDOW_BUDGET } from "@/lib/marketValues";
import GmMode from "./GmMode";
import NewsAdmin from "./NewsAdmin";

export const metadata = { title: "Transfer Centre — The Blues Collective" };
export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const user = await getCurrentUser();

  const supabase = await createClient();

  // The current Chelsea squad is now read from the database (kept fresh by the
  // daily sync), not from a hand-typed file. Departed players are marked
  // inactive by the sync, so they never show here.
  const { data: squadData } = await supabase
    .from("squad_players")
    .select("name, position, market_value")
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("shirt_number", { ascending: true });

  const squad = (squadData ?? []).map((p) => ({
    name: p.name,
    position: p.position,
    club: "Chelsea",
    value: p.market_value == null ? 0 : Number(p.market_value),
  }));

  const { data: news } = await supabase
    .from("transfer_news")
    .select("id, headline, source_url, news_date")
    .order("news_date", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Transfer Centre</h1>
          <p className="mt-1 text-sm text-slate-600">
            Play GM: your window budget is €{WINDOW_BUDGET}m. Buy, sell, loan,
            then publish your rebuild.
          </p>
        </div>
        <Link
          href="/transfers/rebuilds"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-slate-50"
        >
          Community Rebuilds →
        </Link>
      </div>

      {user?.isAdmin && (
        <div className="mb-6">
          <NewsAdmin items={news ?? []} />
        </div>
      )}

      {/* Public transfer news */}
      {news && news.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-bold text-brand-dark">Transfer news</h2>
          <ul className="space-y-1.5">
            {news.map((n) => (
              <li key={n.id} className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 text-xs text-slate-400">
                  {n.news_date}
                </span>
                {n.source_url ? (
                  <a
                    href={n.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-700 hover:text-brand hover:underline"
                  >
                    {n.headline}
                  </a>
                ) : (
                  <span className="text-slate-700">{n.headline}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Curated by the admin — not an automated feed.
          </p>
        </div>
      )}

      <GmMode squad={squad} isLoggedIn={!!user} />

      <p className="mt-6 text-center text-xs text-slate-400">
        Transfer fees are proposed by fans, not real valuations.
      </p>
    </div>
  );
}
