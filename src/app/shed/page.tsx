import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import Composer from "./Composer";
import PostCard from "./PostCard";
import AdminBar from "./AdminBar";
import { ensureMatchdayThreads } from "./actions";
import type { FeedPost, FeedComment, Viewer } from "./types";

export const metadata = { title: "The Shed — The Blues Collective" };
export const dynamic = "force-dynamic";

type PostRow = {
  id: string;
  author: string;
  body: string;
  tag: string | null;
  image_url: string | null;
  created_at: string;
  is_pinned: boolean;
  is_demo: boolean;
  fixture_id: number | null;
  author_profile: { username: string } | null;
  lineup: { formation: string; slots: unknown; title: string | null } | null;
  fixture: { home_team: string; away_team: string } | null;
};

export default async function ShedPage() {
  const user = await getCurrentUser();
  const viewer: Viewer = user ? { id: user.id, isAdmin: user.isAdmin } : null;

  // Auto-open a matchday thread if a fixture kicks off within 2 hours.
  try {
    await ensureMatchdayThreads();
  } catch {
    // Non-fatal — the feed still works without it.
  }

  const supabase = await createClient();

  const { data: postRows } = await supabase
    .from("posts")
    .select(
      `id, author, body, tag, image_url, created_at, is_pinned, is_demo, fixture_id,
       author_profile:profiles!posts_author_fkey(username),
       lineup:lineups(formation, slots, title),
       fixture:fixtures(home_team, away_team)`
    )
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<PostRow[]>();

  const posts = postRows ?? [];
  const postIds = posts.map((p) => p.id);

  // Likes for these posts.
  const likeCounts = new Map<string, number>();
  const likedByMe = new Set<string>();
  if (postIds.length > 0) {
    const { data: likes } = await supabase
      .from("post_likes")
      .select("post_id, user_id")
      .in("post_id", postIds);
    for (const l of likes ?? []) {
      likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1);
      if (viewer && l.user_id === viewer.id) likedByMe.add(l.post_id);
    }
  }

  // Comments for these posts.
  const commentsByPost = new Map<string, FeedComment[]>();
  if (postIds.length > 0) {
    const { data: comments } = await supabase
      .from("comments")
      .select(
        `id, post_id, author, parent_id, body, created_at,
         author_profile:profiles!comments_author_fkey(username)`
      )
      .in("post_id", postIds)
      .order("created_at", { ascending: true })
      .returns<
        {
          id: string;
          post_id: string;
          author: string;
          parent_id: string | null;
          body: string;
          created_at: string;
          author_profile: { username: string } | null;
        }[]
      >();

    for (const c of comments ?? []) {
      const list = commentsByPost.get(c.post_id) ?? [];
      list.push({
        id: c.id,
        authorId: c.author,
        authorName: c.author_profile?.username ?? "fan",
        body: c.body,
        parentId: c.parent_id,
        createdAt: c.created_at,
      });
      commentsByPost.set(c.post_id, list);
    }
  }

  const feed: FeedPost[] = posts.map((p) => ({
    id: p.id,
    authorId: p.author,
    authorName: p.author_profile?.username ?? "fan",
    body: p.body,
    tag: p.tag,
    imageUrl: p.image_url,
    createdAt: p.created_at,
    isPinned: p.is_pinned,
    isDemo: p.is_demo,
    fixtureLabel: p.fixture
      ? `${p.fixture.home_team} v ${p.fixture.away_team}`
      : null,
    likeCount: likeCounts.get(p.id) ?? 0,
    likedByMe: likedByMe.has(p.id),
    lineup: p.lineup
      ? {
          formation: p.lineup.formation,
          // slots is stored as JSON; cast to the shape MiniPitch expects.
          slots: (p.lineup.slots as NonNullable<FeedPost["lineup"]>["slots"]) ?? [],
          title: p.lineup.title,
        }
      : null,
    comments: commentsByPost.get(p.id) ?? [],
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-brand-dark">The Shed</h1>
        <p className="mt-1 text-sm text-slate-600">
          Short takes and match chat from the Collective. Be kind — this is a
          community.
        </p>
      </div>

      {user?.isAdmin && <AdminBar />}

      <div className="mb-6">
        <Composer isLoggedIn={!!user} />
      </div>

      {feed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-slate-500">
          No posts yet — be the first to say something!
        </div>
      ) : (
        <div className="space-y-4">
          {feed.map((post) => (
            <PostCard key={post.id} post={post} viewer={viewer} />
          ))}
        </div>
      )}
    </div>
  );
}
