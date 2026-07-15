import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { readingMinutes } from "@/lib/excerpt";
import { timeAgo } from "@/lib/timeAgo";
import ArticleActions from "./ArticleActions";

export const dynamic = "force-dynamic";

type ArticleRow = {
  id: string;
  author: string;
  title: string;
  body: string;
  created_at: string;
  author_profile: { username: string } | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  return {
    title: data?.title
      ? `${data.title} — The Blues Collective`
      : "Article — The Blues Collective",
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select(
      `id, author, title, body, created_at,
       author_profile:profiles!articles_author_fkey(username)`
    )
    .eq("id", id)
    .maybeSingle<ArticleRow>();

  if (!article) notFound();

  const { count: clapCount } = await supabase
    .from("article_claps")
    .select("*", { count: "exact", head: true })
    .eq("article_id", id);

  let clappedByMe = false;
  if (user) {
    const { data: myClap } = await supabase
      .from("article_claps")
      .select("article_id")
      .eq("article_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    clappedByMe = !!myClap;
  }

  const paragraphs = article.body.split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/articles" className="text-sm text-brand hover:underline">
        ← Back to Long Reads
      </Link>

      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-extrabold leading-tight text-brand-dark">
          {article.title}
        </h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-dark text-xs font-bold text-white">
            {(article.author_profile?.username ?? "fan").slice(0, 2).toUpperCase()}
          </span>
          <span className="font-semibold text-slate-700">
            @{article.author_profile?.username ?? "fan"}
          </span>
          <span>· {timeAgo(article.created_at)}</span>
          <span>· {readingMinutes(article.body)} min read</span>
        </div>

        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-slate-800">
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {p}
            </p>
          ))}
        </div>

        <ArticleActions
          articleId={article.id}
          authorId={article.author}
          authorName={article.author_profile?.username ?? "fan"}
          initialClaps={clapCount ?? 0}
          clappedByMe={clappedByMe}
          viewer={user ? { id: user.id, isAdmin: user.isAdmin } : null}
        />
      </article>
    </div>
  );
}
