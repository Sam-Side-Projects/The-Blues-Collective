"use client";

import { useState, useTransition } from "react";
import {
  toggleClap,
  reportArticle,
  deleteArticle,
  banAuthor,
} from "../actions";

export default function ArticleActions({
  articleId,
  authorId,
  authorName,
  initialClaps,
  clappedByMe,
  viewer,
}: {
  articleId: string;
  authorId: string;
  authorName: string;
  initialClaps: number;
  clappedByMe: boolean;
  viewer: { id: string; isAdmin: boolean } | null;
}) {
  const [claps, setClaps] = useState(initialClaps);
  const [mine, setMine] = useState(clappedByMe);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const canModerate = viewer && (viewer.id === authorId || viewer.isAdmin);

  function clap() {
    if (!viewer) {
      setNotice("Log in to clap for this article.");
      return;
    }
    // Optimistic update.
    setMine((m) => !m);
    setClaps((c) => c + (mine ? -1 : 1));
    startTransition(() => {
      void toggleClap(articleId);
    });
  }

  function report() {
    if (!viewer) {
      setNotice("Log in to report.");
      return;
    }
    const reason = prompt("What's wrong with this article? (optional)");
    if (reason === null) return;
    startTransition(async () => {
      const r = await reportArticle(articleId, reason);
      setNotice(r.message);
    });
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-6">
      <button
        onClick={clap}
        disabled={pending}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
          mine
            ? "border-brand bg-brand text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        👏 {claps} {claps === 1 ? "clap" : "claps"}
      </button>

      <button
        onClick={report}
        disabled={pending}
        className="text-sm text-slate-400 hover:text-red-500"
      >
        Report
      </button>

      {canModerate && (
        <button
          onClick={() => {
            if (confirm("Delete this article? This can't be undone.")) {
              startTransition(async () => {
                await deleteArticle(articleId);
              });
            }
          }}
          disabled={pending}
          className="ml-auto text-sm text-red-500 hover:text-red-700"
        >
          Delete article
        </button>
      )}

      {viewer?.isAdmin && viewer.id !== authorId && (
        <button
          onClick={() => {
            if (confirm(`Ban @${authorName}?`)) {
              startTransition(async () => {
                const r = await banAuthor(authorId);
                setNotice(r.message);
              });
            }
          }}
          disabled={pending}
          className="text-sm text-amber-600 hover:text-amber-800"
        >
          Ban author
        </button>
      )}

      {notice && (
        <p className="w-full text-sm text-slate-500">{notice}</p>
      )}
    </div>
  );
}
