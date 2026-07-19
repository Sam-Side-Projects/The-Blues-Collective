/**
 * Site-wide footer. The disclaimer text is legally required on EVERY page.
 */
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-500">
        <p>
          Unofficial fan project. Not affiliated with Chelsea FC. Transfer fees
          are proposed by fans, not real valuations.
        </p>
        <p className="mt-1">
          © {new Date().getFullYear()} The Blues Collective — a community for
          the fans.
        </p>
      </div>
    </footer>
  );
}
