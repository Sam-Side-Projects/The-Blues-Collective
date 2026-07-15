import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { excerpt, readingMinutes } from "@/lib/excerpt";
import { timeAgo } from "@/lib/timeAgo";

export const metadata = { title: "Long Reads — The Blues Collective" };
export const dynamic = "force-dynamic";

type ArticleRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  is_demo: boolean;
  author_profile: { username: string } | null;
};

export default async function ArticlesPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("articles")
    .select(
      `id, title, body, created_at, is_demo,
       author_profile:profiles!articles_author_fkey(username)`
    )
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<ArticleRow[]>();

  const articles = rows ?? [];

  // Clap counts for these articles.
  const clapCounts = new Map<string, number>();
  if (articles.length > 0) {
    const { data: claps } = await supabase
      .from("article_claps")
      .select("article_id")
      .in(
        "article_id",
        articles.map((a) => a.id)
      );
    for (const c of claps ?? []) {
      clapCounts.set(c.article_id, (clapCounts.get(c.article_id) ?? 0) + 1);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Long Reads</h1>
          <p className="mt-1 text-sm text-slate-600">
            In-depth articles and opinion pieces from the Collective.
          </p>
        </div>
        {user ? (
          <Link
            href="/articles/new"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Write an article
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Log in to write
          </Link>
        )}
      </div>

      {articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-slate-500">
          No articles yet — be the first to write one!
        </div>
      ) : (
        <div className="space-y-4">
          {articles.map((a) => (
            <Link
              key={a.id}
              href={`/articles/${a.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  @{a.author_profile?.username ?? "fan"}
                </span>
                {a.is_demo && (
                  <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">
                    demo
                  </span>
                )}
                <span>· {timeAgo(a.created_at)}</span>
                <span>· {readingMinutes(a.body)} min read</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-brand-dark">
                {a.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{excerpt(a.body)}</p>
              <p className="mt-2 text-xs text-slate-400">
                👏 {clapCounts.get(a.id) ?? 0}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
