export default function ComingSoon({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-brand-dark">{title}</h1>
      <p className="mt-3 text-slate-600">
        This section is coming in {phase}. We&apos;re building The Blues
        Collective one piece at a time — check back soon.
      </p>
    </div>
  );
}
