/**
 * The site's public base URL, used to build absolute links for sharing and for
 * social preview images (Facebook/X need absolute URLs, not relative ones).
 *
 * Order of preference:
 *   1. NEXT_PUBLIC_SITE_URL — set this if you ever move to a custom domain.
 *   2. Vercel's own URL, which is set automatically on every deploy.
 *   3. localhost, for when you're running the site on your own machine.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/** Turn a path like "/lineup/abc" into a full shareable link. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
