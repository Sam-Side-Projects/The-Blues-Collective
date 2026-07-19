import Link from "next/link";
import BrandMark from "./BrandMark";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";

const SECTIONS = [
  { href: "/lineup", label: "Lineup Builder" },
  { href: "/shed", label: "The Shed" },
  { href: "/articles", label: "Long Reads" },
  { href: "/transfers", label: "Transfer Centre" },
  { href: "/predictions", label: "Predictions" },
  { href: "/95-point-game", label: "95-Point Game" },
];

export default async function TopNav() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-brand-dark text-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <BrandMark size={30} />
          <span className="hidden sm:inline">The Blues Collective</span>
        </Link>

        <ul className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="text-slate-200 transition-colors hover:text-white"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-slate-200">
                @{user.username}
                {user.isAdmin && (
                  <span className="ml-1 rounded bg-amber-400 px-1 text-[10px] font-bold text-amber-950">
                    ADMIN
                  </span>
                )}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded bg-white/10 px-3 py-1 hover:bg-white/20"
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-slate-200">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded bg-white px-3 py-1 font-semibold text-brand-dark hover:bg-slate-100"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
