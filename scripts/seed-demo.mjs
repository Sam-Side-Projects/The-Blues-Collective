// Seeds a handful of demo posts/comments/likes (+ one demo lineup) so the
// feed never looks empty. All content is flagged is_demo=true so the admin
// "Clear demo content" button can remove it later.
// Usage: node scripts/seed-demo.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) =>
  env.split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();

const supabase = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

async function ensureDemoUser(email, username) {
  const { data: list } = await supabase.auth.admin.listUsers();
  const found = list.users.find((u) => u.email?.toLowerCase() === email);
  if (found) return found.id;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "demo-" + Math.random().toString(36).slice(2),
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) throw new Error(error.message);
  return data.user.id;
}

const kaiId = await ensureDemoUser("demo_kai@example.com", "kai_bridge");
const bluesyId = await ensureDemoUser("demo_bluesy@example.com", "bluesy_bella");

// Clear previous demo rows so re-running doesn't pile up duplicates.
await supabase.from("comments").delete().eq("is_demo", true);
await supabase.from("posts").delete().eq("is_demo", true);
await supabase.from("articles").delete().eq("is_demo", true);
await supabase.from("rebuilds").delete().eq("is_demo", true);
await supabase.from("lineups").delete().eq("title", "Demo XI");

// A demo lineup so a post can show the mini-pitch card.
const { data: lineup } = await supabase
  .from("lineups")
  .insert({
    owner: kaiId,
    title: "Demo XI",
    formation: "4-2-3-1",
    slots: [
      { slotId: "GK", role: "GK", playerId: null, playerName: "Sanchez" },
      { slotId: "LB", role: "DEF", playerId: null, playerName: "Cucurella" },
      { slotId: "LCB", role: "DEF", playerId: null, playerName: "Colwill" },
      { slotId: "RCB", role: "DEF", playerId: null, playerName: "Fofana" },
      { slotId: "RB", role: "DEF", playerId: null, playerName: "Gusto" },
      { slotId: "DM1", role: "MID", playerId: null, playerName: "Caicedo" },
      { slotId: "DM2", role: "MID", playerId: null, playerName: "Fernandez" },
      { slotId: "LAM", role: "MID", playerId: null, playerName: "Neto" },
      { slotId: "CAM", role: "MID", playerId: null, playerName: "Palmer" },
      { slotId: "RAM", role: "MID", playerId: null, playerName: "Madueke" },
      { slotId: "ST", role: "FWD", playerId: null, playerName: "Jackson" },
    ],
  })
  .select("id")
  .single();

const posts = [
  {
    author: bluesyId,
    body: "Palmer for Ballon d'Or shout might be early but I said what I said. 💙",
    tag: "Debate",
  },
  {
    author: kaiId,
    body: "Here's how I'd line us up this weekend — press high, Palmer free role behind Jackson.",
    tag: "Match",
    lineup_id: lineup?.id ?? null,
  },
  {
    author: bluesyId,
    body: "If we sign a proper striker in January this squad is genuinely top four material.",
    tag: "Transfers",
  },
  {
    author: kaiId,
    body: "Cold night at the Bridge, big three points. Onwards. What did everyone make of the second half?",
    tag: "Fans",
  },
];

const inserted = [];
for (const p of posts) {
  const { data } = await supabase
    .from("posts")
    .insert({ ...p, is_demo: true })
    .select("id")
    .single();
  if (data) inserted.push(data.id);
}

// A couple of demo comments + likes on the first post.
if (inserted[0]) {
  const { data: c1 } = await supabase
    .from("comments")
    .insert({
      post_id: inserted[0],
      author: kaiId,
      body: "Hard to argue after this season tbf.",
      is_demo: true,
    })
    .select("id")
    .single();
  if (c1) {
    await supabase.from("comments").insert({
      post_id: inserted[0],
      author: bluesyId,
      parent_id: c1.id,
      body: "Exactly — the numbers back it up.",
      is_demo: true,
    });
  }
  await supabase.from("post_likes").insert([
    { post_id: inserted[0], user_id: kaiId },
    { post_id: inserted[0], user_id: bluesyId },
  ]);
}

// A demo long-read article.
const { data: article } = await supabase
  .from("articles")
  .insert({
    author: bluesyId,
    title: "The quiet brilliance of a settled midfield",
    body: `For three seasons we searched for balance in the middle of the park. This year, it finally clicked.

The partnership has given us something we've lacked for a long time: control. When you can win the ball back six seconds after losing it, everything else becomes easier. The full-backs push higher. The wingers stay wide and dangerous. The striker gets service.

It isn't glamorous work. You won't see it on the highlight reels. But watch closely and you'll notice the small things — the covering runs, the fouls taken in the right areas, the simple ten-yard passes that keep us ticking.

If we add one more piece in January, there's no reason we can't push for the top four. But even if we don't, this midfield has already given the fans something to believe in again.

Up the Blues.`,
    is_demo: true,
  })
  .select("id")
  .single();

if (article) {
  // A couple of claps on the demo article.
  await supabase.from("article_claps").insert([
    { article_id: article.id, user_id: kaiId },
    { article_id: article.id, user_id: bluesyId },
  ]);
}

// A demo rebuild + a couple of votes.
const { data: rebuild } = await supabase
  .from("rebuilds")
  .insert({
    owner: kaiId,
    title: "Strengthen the spine",
    moves: {
      sold: [
        { name: "Jadon Sancho", position: "FWD", club: "Chelsea", value: 40 },
        { name: "Christopher Nkunku", position: "FWD", club: "Chelsea", value: 55 },
      ],
      loaned_out: [
        { name: "Marc Guiu", position: "FWD", club: "Chelsea", value: 15 },
      ],
      bought: [
        { name: "Alexander Isak", position: "FWD", club: "Newcastle", value: 120 },
      ],
      loaned_in: [
        { name: "Marc Guehi", position: "DEF", club: "Crystal Palace", value: 55 },
      ],
    },
    // spend = 120 (Isak) + 5.5 (Guehi loan 10%) = 125.5 ; raised = 95 ; net = 30.5
    spend: 125.5,
    raised: 95,
    net: 30.5,
    note: "Cash in on the fringe forwards, land a genuine number 9, and add defensive cover on loan. Budget-friendly and balanced.",
    is_demo: true,
  })
  .select("id")
  .single();

if (rebuild) {
  await supabase.from("rebuild_votes").insert([
    { rebuild_id: rebuild.id, user_id: kaiId },
    { rebuild_id: rebuild.id, user_id: bluesyId },
  ]);
}

// A demo transfer-news item.
await supabase
  .from("transfer_news")
  .delete()
  .eq("headline", "Blues open talks over marquee striker signing");
await supabase.from("transfer_news").insert({
  headline: "Blues open talks over marquee striker signing",
  source_url: "https://www.example.com/transfer-rumour",
  news_date: new Date().toISOString().slice(0, 10),
});

// =============================================================
// Phase 5: prediction-league demo (upcoming fixture to predict +
// a scored past fixture with a confirmed XI and two predictions).
// Uses negative fixture ids so real football-data.org ids never clash.
// =============================================================
const FIX_UPCOMING = -10;
const FIX_PAST = -11;

// Clean previous demo prediction rows in dependency-safe order.
await supabase.from("prediction_scores").delete().in("fixture_ref", [FIX_UPCOMING, FIX_PAST]);
await supabase.from("confirmed_lineups").delete().in("fixture_ref", [FIX_UPCOMING, FIX_PAST]);
await supabase
  .from("lineups")
  .delete()
  .eq("is_prediction", true)
  .in("fixture_id", [FIX_UPCOMING, FIX_PAST]);
await supabase.from("fixtures").delete().in("id", [FIX_UPCOMING, FIX_PAST]);

const nowMs = Date.now();
const DAY = 24 * 60 * 60 * 1000;

await supabase.from("fixtures").insert([
  {
    id: FIX_UPCOMING,
    season: "2025/26",
    matchday: 20,
    home_team: "Chelsea",
    away_team: "Brighton",
    chelsea_home: true,
    opponent: "Brighton",
    kickoff: new Date(nowMs + 3 * DAY).toISOString(),
    status: "SCHEDULED",
  },
  {
    id: FIX_PAST,
    season: "2025/26",
    matchday: 19,
    home_team: "Chelsea",
    away_team: "West Ham",
    chelsea_home: true,
    opponent: "West Ham",
    kickoff: new Date(nowMs - 2 * DAY).toISOString(),
    status: "FINISHED",
    home_score: 2,
    away_score: 1,
  },
]);

// Formation slot maps (id, role) matching src/lib/formations.ts.
const F4231 = [
  ["GK", "GK"], ["LB", "DEF"], ["LCB", "DEF"], ["RCB", "DEF"], ["RB", "DEF"],
  ["DM1", "MID"], ["DM2", "MID"], ["LAM", "MID"], ["CAM", "MID"], ["RAM", "MID"], ["ST", "FWD"],
];
const F433 = [
  ["GK", "GK"], ["LB", "DEF"], ["LCB", "DEF"], ["RCB", "DEF"], ["RB", "DEF"],
  ["CM1", "MID"], ["CM2", "MID"], ["CM3", "MID"], ["LW", "FWD"], ["ST", "FWD"], ["RW", "FWD"],
];
const toSlots = (def, names) =>
  def.map(([slotId, role], i) => ({ slotId, role, playerId: null, playerName: names[i] ?? null }));

// The confirmed XI for the past match (4-2-3-1).
const confirmedNames = [
  "Robert Sanchez", "Marc Cucurella", "Levi Colwill", "Wesley Fofana", "Malo Gusto",
  "Moises Caicedo", "Enzo Fernandez", "Pedro Neto", "Cole Palmer", "Noni Madueke", "Nicolas Jackson",
];
const confirmedPos = ["G", "D", "D", "D", "D", "M", "M", "M", "M", "M", "F"];

await supabase.from("confirmed_lineups").insert({
  fixture_ref: FIX_PAST,
  formation: "4-2-3-1",
  starters: confirmedNames.map((n, i) => ({
    player_id: null,
    player_name: n,
    position: confirmedPos[i],
  })),
});

// Predictions for the past match: kai nails 10/11 + formation; bluesy gets 10.
const kaiPast = [
  "Robert Sanchez", "Marc Cucurella", "Levi Colwill", "Wesley Fofana", "Malo Gusto",
  "Moises Caicedo", "Enzo Fernandez", "Pedro Neto", "Cole Palmer", "Jadon Sancho", "Nicolas Jackson",
];
const bluesyPast = [
  "Robert Sanchez", "Marc Cucurella", "Levi Colwill", "Wesley Fofana", "Reece James",
  "Moises Caicedo", "Enzo Fernandez", "Cole Palmer", "Pedro Neto", "Nicolas Jackson", "Noni Madueke",
];

await supabase.from("lineups").insert([
  { owner: kaiId, title: "Prediction", formation: "4-2-3-1", slots: toSlots(F4231, kaiPast), fixture_id: FIX_PAST, is_prediction: true },
  { owner: bluesyId, title: "Prediction", formation: "4-3-3", slots: toSlots(F433, bluesyPast), fixture_id: FIX_PAST, is_prediction: true },
]);

// Score them (same rules as src/lib/predictions.ts).
const norm = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const confirmedSet = new Set(confirmedNames.map(norm));
const scoreOf = (names, formation) => {
  const seen = new Set();
  let correct = 0;
  for (const n of names) {
    const k = norm(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (confirmedSet.has(k)) correct++;
  }
  const bonus = formation.replace(/\s/g, "") === "4-2-3-1";
  return { points: correct + (bonus ? 3 : 0), correct, bonus };
};
const kaiScore = scoreOf(kaiPast, "4-2-3-1");
const bluesyScore = scoreOf(bluesyPast, "4-3-3");

await supabase.from("prediction_scores").insert([
  { user_id: kaiId, fixture_ref: FIX_PAST, points: kaiScore.points, correct_starters: kaiScore.correct, formation_bonus: kaiScore.bonus },
  { user_id: bluesyId, fixture_ref: FIX_PAST, points: bluesyScore.points, correct_starters: bluesyScore.correct, formation_bonus: bluesyScore.bonus },
]);

// Predictions for the upcoming match (drive the Consensus XI).
await supabase.from("lineups").insert([
  { owner: kaiId, title: "Prediction", formation: "4-2-3-1", slots: toSlots(F4231, confirmedNames), fixture_id: FIX_UPCOMING, is_prediction: true },
  { owner: bluesyId, title: "Prediction", formation: "4-3-3", slots: toSlots(F433, bluesyPast), fixture_id: FIX_UPCOMING, is_prediction: true },
]);

console.log(
  `✅ Seeded ${inserted.length} demo posts (lineup, comments, likes) + 1 article + 1 rebuild + 1 news item.\n` +
    `✅ Prediction league: 1 upcoming fixture (predict) + 1 scored past fixture ` +
    `(kai ${kaiScore.points}pts, bluesy ${bluesyScore.points}pts).`
);
