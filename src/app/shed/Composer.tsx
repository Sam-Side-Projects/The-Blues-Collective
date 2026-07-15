"use client";

import { useRef, useState, useTransition } from "react";
import { createPost } from "./actions";

const TAGS = ["Match", "Transfers", "Debate", "Fans"];
const MAX = 500;

export default function Composer({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
        <a href="/login" className="font-semibold text-brand hover:underline">
          Log in
        </a>{" "}
        or{" "}
        <a href="/signup" className="font-semibold text-brand hover:underline">
          sign up
        </a>{" "}
        to join the conversation in The Shed.
      </div>
    );
  }

  function onSubmit(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await createPost(formData);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setBody("");
        setTag("");
        setFileName(null);
        formRef.current?.reset();
      }
    });
  }

  const remaining = MAX - body.length;

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX}
        rows={3}
        placeholder="What's on your mind, Blue? (match takes, transfer gossip, hot debates…)"
        className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? "" : t)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                tag === t
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <span
          className={`ml-auto text-xs ${
            remaining < 0 ? "text-red-600" : "text-slate-400"
          }`}
        >
          {remaining}
        </span>
      </div>

      {/* Hidden input carries the chosen tag to the server action */}
      <input type="hidden" name="tag" value={tag} />

      <div className="mt-3 flex items-center justify-between gap-2">
        <label className="cursor-pointer text-xs font-medium text-brand hover:underline">
          {fileName ? `Image: ${fileName}` : "Attach image (max 2MB)"}
          <input
            type="file"
            name="image"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>

        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </div>

      {msg && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}
    </form>
  );
}
