import Link from "next/link";
import SignUpForm from "./SignUpForm";

export const metadata = { title: "Sign up — The Blues Collective" };

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-brand-dark">Join the Collective</h1>
      <p className="mt-1 text-sm text-slate-600">
        Create a free account to build lineups, post, and predict.
      </p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SignUpForm />
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
