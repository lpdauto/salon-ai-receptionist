import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";
import { PlaceholderTable } from "@/components/PlaceholderTable";
import { getDashboardData } from "@/lib/dashboard-data";

export default async function RequestsPage() {
  const data = await getDashboardData();
  const pending = data.appointmentRequests.filter(
    (request) => request.status === "pending",
  ).length;
  const needsReview = data.appointmentRequests.filter(
    (request) => request.status === "needs_review",
  ).length;
  const rows = data.appointmentRequests.map((request) => [
    request.customer_name ?? "Unknown customer",
    request.customer_phone ?? "No phone",
    request.requested_service ?? "Service not specified",
    [request.requested_date, request.requested_time].filter(Boolean).join(" ") ||
      "Flexible",
    request.status,
  ]);

  return (
    <DashboardShell title="Requests" eyebrow="Booking pipeline">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open requests" value={String(data.appointmentRequests.length)} helper="Not confirmed bookings" tone="violet" />
        <MetricCard label="Pending" value={String(pending)} helper="Needs reply" tone="amber" />
        <MetricCard label="Need review" value={String(needsReview)} helper="Owner decision" tone="rose" />
        <MetricCard label="Services available" value={String(data.services.length)} helper="For request matching" tone="slate" />
      </div>

      <section className="mt-6">
        <h2 className="mb-4 text-xl font-black tracking-tight">
          Appointment requests
        </h2>
        <PlaceholderTable
          columns={["Customer", "Phone", "Service", "Requested time", "Status"]}
          rows={rows}
        />
      </section>
    </DashboardShell>
  );
}
