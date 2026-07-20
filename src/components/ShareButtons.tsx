"use client";

import { useEffect, useState } from "react";

/**
 * Share a page. On phones this uses the built-in share sheet (the same one you
 * get from any app), which is the natural way to share on mobile. On desktop,
 * where that sheet usually doesn't exist, it falls back to a copy-link button.
 * X and Facebook are plain share links — no accounts, no API, nothing is ever
 * posted automatically.
 */
export default function ShareButtons({
  url,
  title,
}: {
  url: string;
  title: string;
}) {
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  // navigator.share only exists in the browser, and mostly on phones — so we
  // check after mount to avoid a server/client mismatch.
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  async function nativeShare() {
    try {
      await navigator.share({ title, text: title, url });
    } catch {
      // The user dismissed the share sheet — nothing to do.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(title);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Share
      </span>

      {canNativeShare ? (
        <button
          onClick={nativeShare}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
        >
          Share
        </button>
      ) : (
        <button
          onClick={copyLink}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
        >
          {copied ? "Link copied!" : "Copy link"}
        </button>
      )}

      <a
        href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        X
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Facebook
      </a>

      {/* On mobile the share sheet covers copying, but offer it anyway. */}
      {canNativeShare && (
        <button
          onClick={copyLink}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      )}
    </div>
  );
}
