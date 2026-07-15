"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { addTransferNews, deleteTransferNews, type ActionResult } from "./actions";

const initial: ActionResult = { ok: true, message: "" };

type NewsItem = {
  id: string;
  headline: string;
  source_url: string | null;
  news_date: string;
};

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Adding…" : "Add news"}
    </button>
  );
}

export default function NewsAdmin({ items }: { items: NewsItem[] }) {
  const [state, formAction] = useActionState(addTransferNews, initial);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-bold text-amber-900">Admin: Transfer news</h2>
      <p className="mb-3 text-xs text-amber-800">
        Add curated news items by hand. These show publicly below.
      </p>

      <form action={formAction} className="space-y-2">
        <input
          name="headline"
          required
          placeholder="Headline (e.g. Blues in talks for striker)"
          className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <input
            name="source_url"
            type="url"
            placeholder="Source link (optional)"
            className="min-w-0 flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <input
            name="news_date"
            type="date"
            className="rounded-lg border border-amber-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <AddButton />
        </div>
        {state.message && (
          <p
            className={`text-sm ${
              state.ok ? "text-green-700" : "text-red-700"
            }`}
          >
            {state.message}
          </p>
        )}
      </form>

      {items.length > 0 && (
        <ul className="mt-3 space-y-1">
          {items.map((n) => (
            <li
              key={n.id}
              className="flex items-center gap-2 rounded bg-white px-2 py-1 text-xs"
            >
              <span className="text-slate-400">{n.news_date}</span>
              <span className="flex-1 truncate text-slate-700">{n.headline}</span>
              <button
                onClick={() => {
                  if (confirm("Delete this news item?")) {
                    startTransition(() => {
                      void deleteTransferNews(n.id);
                    });
                  }
                }}
                disabled={pending}
                className="text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
