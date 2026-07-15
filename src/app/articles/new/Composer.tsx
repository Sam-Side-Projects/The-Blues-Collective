"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createArticle, type ActionResult } from "../actions";

const initial: ActionResult = { ok: true, message: "" };

function PublishButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Publishing…" : "Publish article"}
    </button>
  );
}

export default function ArticleComposer() {
  const [state, formAction] = useActionState(createArticle, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-700">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          maxLength={140}
          required
          placeholder="e.g. Why Palmer is the signing of the decade"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-semibold focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="body" className="block text-sm font-medium text-slate-700">
          Article
        </label>
        <textarea
          id="body"
          name="body"
          rows={16}
          required
          placeholder="Write your piece here. Leave a blank line between paragraphs — they'll be kept when published."
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <p className="mt-1 text-xs text-slate-500">
          Plain text for now. Blank lines between paragraphs are preserved.
        </p>
      </div>

      {!state.ok && state.message && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <a
          href="/articles"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </a>
        <PublishButton />
      </div>
    </form>
  );
}
