export type FeedComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  parentId: string | null;
  createdAt: string;
};

export type FeedLineup = {
  formation: string;
  slots: {
    slotId: string;
    role: string;
    playerId: number | null;
    playerName: string | null;
  }[];
  title: string | null;
};

export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  tag: string | null;
  imageUrl: string | null;
  createdAt: string;
  isPinned: boolean;
  isDemo: boolean;
  fixtureLabel: string | null;
  likeCount: number;
  likedByMe: boolean;
  lineup: FeedLineup | null;
  comments: FeedComment[];
};

export type Viewer = { id: string; isAdmin: boolean } | null;
