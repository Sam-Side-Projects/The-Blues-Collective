import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ArticleComposer from "./Composer";

export const metadata = { title: "Write an article — The Blues Collective" };

export default async function NewArticlePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">Write a Long Read</h1>
        <Link href="/articles" className="text-sm text-brand hover:underline">
          ← Back to articles
        </Link>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ArticleComposer />
      </div>
    </div>
  );
}
