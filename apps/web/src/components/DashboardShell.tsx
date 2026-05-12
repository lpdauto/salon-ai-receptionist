import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/calls", label: "Calls" },
  { href: "/dashboard/requests", label: "Requests" },
  { href: "/dashboard/settings", label: "Settings" },
];

type DashboardShellProps = {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
};

export function DashboardShell({ title, eyebrow, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4 px-5 py-4 lg:block lg:px-6 lg:py-6">
            <Link href="/dashboard" className="block">
              <div className="text-sm font-black uppercase tracking-[0.22em] text-violet-700">
                Salon AI
              </div>
              <div className="mt-1 text-lg font-bold tracking-tight">
                Receptionist
              </div>
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 lg:hidden"
            >
              Sign out
            </Link>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-5 pb-4 lg:flex-col lg:overflow-visible lg:px-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden px-6 pb-6 pt-3 lg:block">
            <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
              <div className="text-sm font-bold text-violet-950">
                Demo Workspace
              </div>
              <p className="mt-2 text-sm leading-6 text-violet-800">
                Placeholder data only. Supabase, Twilio, and AI voice are coming
                later.
              </p>
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {eyebrow ? (
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-violet-700">
                    {eyebrow}
                  </div>
                ) : null}
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  {title}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
                  Demo mode
                </div>
                <Link
                  href="/login"
                  className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 lg:inline-flex"
                >
                  Sign out
                </Link>
              </div>
            </div>
          </header>

          <div className="px-5 py-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
