"use client";

import { useState, useTransition } from "react";
import { clearDemoContent } from "./actions";

export default function AdminBar() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
      <span className="font-semibold text-amber-800">Admin tools</span>
      <button
        onClick={() => {
          if (
            confirm(
              "Remove ALL demo posts, comments, articles and rebuilds? This can't be undone."
            )
          ) {
            startTransition(async () => {
              const r = await clearDemoContent();
              setMsg(r.message);
            });
          }
        }}
        disabled={pending}
        className="rounded bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "Clearing…" : "Clear demo content"}
      </button>
      {msg && <span className="text-amber-800">{msg}</span>}
    </div>
  );
}
