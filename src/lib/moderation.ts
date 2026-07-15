/**
 * Very simple blocked-words filter used when submitting posts and comments.
 * This is intentionally basic — a real safety net, not a perfect one. You
 * (admin) can grow this list over time.
 *
 * We match whole words case-insensitively so we don't accidentally flag
 * innocent words that merely contain a short string (the "Scunthorpe problem").
 */
const BLOCKED_WORDS: string[] = [
  // Slurs / hate — keep this list private and expand as needed.
  "nigger",
  "faggot",
  "retard",
  "paki",
  "spastic",
  // Spam-ish
  "viagra",
  "casino",
];

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function checkText(text: string): ModerationResult {
  const lower = text.toLowerCase();
  for (const word of BLOCKED_WORDS) {
    // Word-boundary match.
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}([^a-z0-9]|$)`, "i");
    if (re.test(lower)) {
      return {
        ok: false,
        reason:
          "Your message contains a word that isn't allowed here. Please rephrase and try again.",
      };
    }
  }
  return { ok: true };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
