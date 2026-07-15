import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { getCurrentUser } from "@/lib/auth";

const CARDS = [
  {
    href: "/lineup",
    title: "Lineup Builder",
    blurb: "Pick your XI across four formations and share it as an image.",
  },
  {
    href: "/shed",
    title: "The Shed",
    blurb: "Short takes, match chat, and transfer gossip from the fans.",
  },
  {
    href: "/articles",
    title: "Long Reads",
    blurb: "In-depth fan articles, tactics breakdowns, and opinion pieces.",
  },
  {
    href: "/transfers",
    title: "Transfer Centre",
    blurb: "Play GM: sell, sign, and publish your window rebuild.",
  },
  {
    href: "/predictions",
    title: "Predictions",
    blurb: "Predict the XI, score points, and climb the leaderboard.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="flex flex-col items-center text-center">
        <BrandMark size={72} />
        <h1 className="mt-4 text-3xl font-extrabold text-brand-dark sm:text-4xl">
          The Blues Collective
        </h1>
        <p className="mt-3 max-w-xl text-slate-600">
          A community built by Chelsea fans, for Chelsea fans. Build lineups,
          debate the big calls, write long reads, run the transfer window, and
          test your team-sheet predictions.
        </p>
        <div className="mt-6 flex gap-3">
          {user ? (
            <Link
              href="/lineup"
              className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-dark"
            >
              Build a lineup
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-dark"
              >
                Join the Collective
              </Link>
              <Link
                href="/lineup"
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold text-brand-dark hover:bg-slate-50"
              >
                Take a look around
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <h2 className="font-bold text-brand-dark">{c.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{c.blurb}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
