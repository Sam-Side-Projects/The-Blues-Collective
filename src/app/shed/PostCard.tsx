"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import MiniPitch from "@/components/MiniPitch";
import { timeAgo } from "@/lib/timeAgo";
import type { FeedPost, Viewer } from "./types";
import {
  toggleLike,
  addComment,
  reportContent,
  deletePost,
  deleteComment,
  banUser,
} from "./actions";

export default function PostCard({
  post,
  viewer,
}: {
  post: FeedPost;
  viewer: Viewer;
}) {
  const [showComments, setShowComments] = useState(post.isPinned);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const canModerate =
    viewer && (viewer.id === post.authorId || viewer.isAdmin);

  // Organise comments into one-level threads.
  const topLevel = post.comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) =>
    post.comments.filter((c) => c.parentId === id);

  function like() {
    if (!viewer) {
      setNotice("Log in to like posts.");
      return;
    }
    startTransition(() => {
      void toggleLike(post.id);
    });
  }

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        post.isPinned ? "border-brand ring-1 ring-brand/30" : "border-slate-200"
      }`}
    >
      {post.isPinned && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
          📌 Matchday thread{post.fixtureLabel ? ` · ${post.fixtureLabel}` : ""}
        </div>
      )}

      <header className="flex items-center gap-2 text-sm">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-dark text-xs font-bold text-white">
          {post.authorName.slice(0, 2).toUpperCase()}
        </span>
        <div className="flex-1">
          <span className="font-semibold text-slate-800">
            @{post.authorName}
          </span>
          {post.isDemo && (
            <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">
              demo
            </span>
          )}
          <span className="ml-2 text-xs text-slate-400">
            {timeAgo(post.createdAt)}
          </span>
        </div>
        {post.tag && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {post.tag}
          </span>
        )}
      </header>

      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
        {post.body}
      </p>

      {post.imageUrl && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          {/* Uploaded fan image */}
          <Image
            src={post.imageUrl}
            alt="Attached by poster"
            width={600}
            height={400}
            className="h-auto w-full object-cover"
            unoptimized
          />
        </div>
      )}

      {post.lineup && (
        <div className="mt-3 max-w-[220px]">
          <MiniPitch
            formation={post.lineup.formation}
            slots={post.lineup.slots}
            title={post.lineup.title}
          />
        </div>
      )}

      {/* Action bar */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
        <button
          onClick={like}
          disabled={pending}
          className={`flex items-center gap-1 hover:text-brand ${
            post.likedByMe ? "font-semibold text-brand" : ""
          }`}
        >
          {post.likedByMe ? "♥" : "♡"} {post.likeCount}
        </button>

        <button
          onClick={() => setShowComments((s) => !s)}
          className="hover:text-brand"
        >
          💬 {post.comments.length}
        </button>

        <ReportButton targetType="post" targetId={post.id} viewer={viewer} />

        {canModerate && (
          <button
            onClick={() => {
              if (confirm("Delete this post?")) {
                startTransition(async () => {
                  const r = await deletePost(post.id);
                  setNotice(r.message);
                });
              }
            }}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            Delete
          </button>
        )}

        {viewer?.isAdmin && viewer.id !== post.authorId && (
          <button
            onClick={() => {
              if (
                confirm(
                  `Ban @${post.authorName}? They will no longer be able to post or comment.`
                )
              ) {
                startTransition(async () => {
                  const r = await banUser(post.authorId);
                  setNotice(r.message);
                });
              }
            }}
            className="text-amber-600 hover:text-amber-800"
          >
            Ban user
          </button>
        )}
      </div>

      {notice && <p className="mt-2 text-xs text-slate-500">{notice}</p>}

      {showComments && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {topLevel.length === 0 && (
            <p className="text-xs text-slate-400">
              No comments yet — start the conversation.
            </p>
          )}
          <ul className="space-y-3">
            {topLevel.map((c) => (
              <li key={c.id}>
                <CommentRow
                  postId={post.id}
                  comment={c}
                  viewer={viewer}
                  onNotice={setNotice}
                />
                <ul className="mt-2 space-y-2 border-l border-slate-100 pl-4">
                  {repliesOf(c.id).map((r) => (
                    <li key={r.id}>
                      <CommentRow
                        postId={post.id}
                        comment={r}
                        viewer={viewer}
                        onNotice={setNotice}
                        isReply
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {viewer ? (
            <CommentBox postId={post.id} parentId={null} />
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              <a href="/login" className="text-brand hover:underline">
                Log in
              </a>{" "}
              to comment.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/* ------------------------- Comment row ------------------------- */
function CommentRow({
  postId,
  comment,
  viewer,
  onNotice,
  isReply = false,
}: {
  postId: string;
  comment: FeedPost["comments"][number];
  viewer: Viewer;
  onNotice: (s: string) => void;
  isReply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [pending, startTransition] = useTransition();
  const canModerate =
    viewer && (viewer.id === comment.authorId || viewer.isAdmin);

  return (
    <div className="text-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-slate-700">
          @{comment.authorName}
        </span>
        <span className="text-xs text-slate-400">
          {timeAgo(comment.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-slate-700">{comment.body}</p>
      <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
        {viewer && !isReply && (
          <button
            onClick={() => setReplying((r) => !r)}
            className="hover:text-brand"
          >
            Reply
          </button>
        )}
        <ReportButton
          targetType="comment"
          targetId={comment.id}
          viewer={viewer}
        />
        {canModerate && (
          <button
            onClick={() => {
              if (confirm("Delete this comment?")) {
                startTransition(async () => {
                  const r = await deleteComment(comment.id);
                  onNotice(r.message);
                });
              }
            }}
            disabled={pending}
            className="text-red-400 hover:text-red-600"
          >
            Delete
          </button>
        )}
      </div>
      {replying && (
        <CommentBox
          postId={postId}
          parentId={comment.id}
          onDone={() => setReplying(false)}
        />
      )}
    </div>
  );
}

/* ------------------------- Comment box ------------------------- */
function CommentBox({
  postId,
  parentId,
  onDone,
}: {
  postId: string;
  parentId: string | null;
  onDone?: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      const r = await addComment(postId, text, parentId);
      if (r.ok) {
        setText("");
        onDone?.();
      } else {
        setErr(r.message);
      }
    });
  }

  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr(null);
          }}
          maxLength={500}
          placeholder={parentId ? "Write a reply…" : "Add a comment…"}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) submit();
          }}
        />
        <button
          onClick={submit}
          disabled={pending || !text.trim()}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? "…" : "Send"}
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/* ------------------------- Report button ------------------------- */
function ReportButton({
  targetType,
  targetId,
  viewer,
}: {
  targetType: "post" | "comment";
  targetId: string;
  viewer: Viewer;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (done) return <span className="text-xs text-slate-400">Reported</span>;

  function report() {
    if (!viewer) {
      alert("Please log in to report content.");
      return;
    }
    const reason = prompt(
      "What's wrong with this " + targetType + "? (optional)"
    );
    // prompt returns null if cancelled
    if (reason === null) return;
    startTransition(async () => {
      const r = await reportContent(targetType, targetId, reason);
      if (r.ok) setDone(true);
      else alert(r.message);
    });
  }

  return (
    <button
      onClick={report}
      disabled={pending}
      className="text-xs text-slate-400 hover:text-red-500"
    >
      Report
    </button>
  );
}
