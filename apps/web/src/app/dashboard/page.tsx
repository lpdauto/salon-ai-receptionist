import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";
import { PlaceholderTable } from "@/components/PlaceholderTable";
import { getDashboardData } from "@/lib/dashboard-data";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const unresolvedCalls = data.calls.filter((call) => call.unresolved).length;
  const pendingRequests = data.appointmentRequests.filter((request) =>
    ["pending", "needs_review"].includes(request.status),
  ).length;
  const activeServices = data.services.filter((service) => service.is_active).length;
  const recentRows = [
    ...data.appointmentRequests.slice(0, 3).map((request) => [
      "Request",
      request.customer_name ?? "Unknown customer",
      request.requested_service ?? "Service not specified",
      request.status,
    ]),
    ...data.calls.slice(0, 3).map((call) => [
      "Call",
      call.from_phone ?? "Unknown caller",
      call.summary ?? "No summary yet",
      call.unresolved ? "unresolved" : call.status,
    ]),
  ].slice(0, 5);

  return (
    <DashboardShell title="Dashboard" eyebrow={`Today at ${data.business.name}`}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Calls captured"
          value={String(data.calls.length)}
          helper={data.isConnected ? "Supabase live" : "Fallback data"}
          tone={data.isConnected ? "emerald" : "amber"}
        />
        <MetricCard
          label="Appointment requests"
          value={String(data.appointmentRequests.length)}
          helper={`${pendingRequests} need review`}
          tone="violet"
        />
        <MetricCard
          label="Unresolved calls"
          value={String(unresolvedCalls)}
          helper="Owner follow-up"
          tone={unresolvedCalls > 0 ? "amber" : "emerald"}
        />
        <MetricCard
          label="Active services"
          value={String(activeServices)}
          helper="Menu ready"
          tone="slate"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-black tracking-tight">
                Recent activity
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Calls and request events will stream here later.
              </p>
            </div>
          </div>
          <PlaceholderTable
            columns={["Type", "Customer / Caller", "Summary", "Status"]}
            rows={recentRows}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black tracking-tight">AI coverage</h2>
          <div className="mt-5 space-y-4">
            {[
              ["Primary language", data.aiSettings.primary_language, "bg-violet-50 text-violet-700"],
              [
                "Language detection",
                data.aiSettings.language_detection_enabled ? "Enabled" : "Disabled",
                data.aiSettings.language_detection_enabled
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700",
              ],
              [
                "Supported languages",
                `${data.aiSettings.supported_languages.length} configured`,
                "bg-slate-50 text-slate-700",
              ],
              ["Voice receptionist", "Not connected", "bg-amber-50 text-amber-700"],
            ].map(([label, status, style]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-2xl border border-slate-100 p-4"
              >
                <span className="font-semibold text-slate-700">{label}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${style}`}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
