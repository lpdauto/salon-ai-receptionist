type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  tone?: "violet" | "emerald" | "amber" | "rose" | "slate";
};

const toneStyles = {
  violet: "border-violet-100 bg-violet-50 text-violet-700",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  rose: "border-rose-100 bg-rose-50 text-rose-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

export function MetricCard({
  label,
  value,
  helper,
  tone = "slate",
}: MetricCardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </div>
      <div
        className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${toneStyles[tone]}`}
      >
        {helper}
      </div>
    </section>
  );
}

