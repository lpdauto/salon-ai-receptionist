import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white p-6 shadow-2xl shadow-violet-950/30 sm:p-8">
        <div className="mb-8">
          <div className="text-sm font-black uppercase tracking-[0.24em] text-violet-700">
            Salon AI
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Welcome back
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Sign in to manage calls, booking requests, and salon receptionist
            settings.
          </p>
        </div>

        <form className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Email</span>
            <input
              type="email"
              placeholder="owner@salon.com"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Password
            </span>
            <input
              type="password"
              placeholder="••••••••"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
          </label>
          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-200 transition hover:bg-violet-800"
          >
            Continue to dashboard
          </Link>
        </form>

        <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">
          Authentication is a placeholder for now. Supabase auth will be added
          in a later phase.
        </p>
      </section>
    </main>
  );
}
