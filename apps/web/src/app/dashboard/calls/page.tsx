import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";
import { PlaceholderTable } from "@/components/PlaceholderTable";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const data = await getDashboardData();
  const unresolvedCalls = data.calls.filter((call) => call.unresolved).length;
  const rows = data.calls.map((call) => [
    call.from_phone ?? "Unknown",
    call.to_phone ?? "Unknown",
    call.twilio_call_sid ?? "No SID yet",
    call.summary ?? call.transcript ?? "No summary yet",
    call.unresolved ? "Unresolved" : call.status,
  ]);

  return (
    <DashboardShell title="Calls" eyebrow="Voice activity">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total calls" value={String(data.calls.length)} helper="Current salon" tone="slate" />
        <MetricCard label="Inbound" value={String(data.calls.filter((call) => call.direction === "inbound").length)} helper="Captured" tone="emerald" />
        <MetricCard label="Unresolved" value={String(unresolvedCalls)} helper="Needs review" tone="amber" />
        <MetricCard label="With Twilio SID" value={String(data.calls.filter((call) => call.twilio_call_sid).length)} helper="Ready for Twilio" tone="violet" />
      </div>

      <section className="mt-6">
        <h2 className="mb-4 text-xl font-black tracking-tight">Call log</h2>
        <PlaceholderTable
          columns={["From", "To", "Twilio SID", "Summary", "Status"]}
          rows={rows}
        />
      </section>
    </DashboardShell>
  );
}
