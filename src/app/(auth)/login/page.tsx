import Link from "next/link";
import LogInForm from "./LogInForm";

export const metadata = { title: "Log in — The Blues Collective" };

export default function LogInPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-brand-dark">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-600">
        Log in to pick up where you left off.
      </p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <LogInForm />
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
