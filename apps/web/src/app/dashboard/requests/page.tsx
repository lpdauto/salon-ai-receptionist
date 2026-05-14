import { DashboardShell } from "@/components/DashboardShell";
import { MetricCard } from "@/components/MetricCard";
import { getDashboardData, AppointmentRequest } from "@/lib/dashboard-data";

export default async function RequestsPage() {
  const data = await getDashboardData();
  const activeRequests = data.appointmentRequests.filter((request) => request.status !== "archived");
  const needsReview = activeRequests.filter((request) => request.needs_review || request.status === "needs_review").length;
  const confirmed = activeRequests.filter((request) => request.status === "confirmed").length;

  return (
    <DashboardShell title="Requests" eyebrow="Booking pipeline">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active requests" value={String(activeRequests.length)} helper="Awaiting owner action" tone="violet" />
        <MetricCard label="Need review" value={String(needsReview)} helper="Missing details" tone="rose" />
        <MetricCard label="Confirmed" value={String(confirmed)} helper="SMS sent" tone="emerald" />
        <MetricCard label="Services available" value={String(data.services.length)} helper="For request matching" tone="slate" />
      </div>

      <section className="mt-6">
        <h2 className="mb-4 text-xl font-black tracking-tight">Appointment requests</h2>
        <div className="space-y-3">
          {activeRequests.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
              No active appointment requests.
            </div>
          ) : (
            activeRequests.map((request) => <RequestCard key={request.id} request={request} />)
          )}
        </div>
      </section>
    </DashboardShell>
  );
}

function RequestCard({ request }: { request: AppointmentRequest }) {
  const requestedDateTime = formatRequestedDateTime(request);
  const missing = request.missing_fields?.length ? request.missing_fields.map(formatMissingField).join(", ") : null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-slate-950">{request.customer_name ?? "Unknown customer"}</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-600">
              {formatStatus(request.status)}
            </span>
            {request.needs_review ? (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] text-rose-700">
                Needs review
              </span>
            ) : null}
          </div>
          <dl className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Phone" value={request.customer_phone ?? "Missing"} />
            <Field label="Service" value={request.requested_service ?? "Missing"} />
            <Field label="Requested time" value={requestedDateTime} />
            <Field label="Created" value={formatDate(request.created_at)} />
          </dl>
          {missing ? <p className="mt-3 text-sm font-semibold text-rose-700">Missing: {missing}</p> : null}
          {request.notes ? <p className="mt-2 text-sm text-slate-500">{request.notes}</p> : null}
          {request.suggested_datetime_text ? (
            <p className="mt-2 text-sm font-semibold text-amber-700">Suggested: {request.suggested_datetime_text}</p>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 lg:w-[360px]">
          <div className="flex flex-wrap gap-2">
            <ActionButton action={`/api/requests/${request.id}/approve`} label="Approve requested time" disabled={!request.customer_phone || request.status === "confirmed"} />
            <ActionButton action={`/api/requests/${request.id}/mark-contacted`} label="Mark contacted" disabled={request.status === "contacted"} />
            <ActionButton action={`/api/requests/${request.id}/archive`} label="Archive" tone="muted" />
          </div>
          <form action={`/api/requests/${request.id}/suggest-time`} method="post" className="flex gap-2">
            <input
              name="suggested_datetime_text"
              placeholder="New date/time"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-400"
            />
            <button className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">
              Suggest new time
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function ActionButton({
  action,
  label,
  disabled = false,
  tone = "primary",
}: {
  action: string;
  label: string;
  disabled?: boolean;
  tone?: "primary" | "muted";
}) {
  return (
    <form action={action} method="post">
      <button
        disabled={disabled}
        className={`rounded-xl px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${
          tone === "primary" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

function formatRequestedDateTime(request: AppointmentRequest) {
  if (request.requested_datetime_text) {
    return request.requested_datetime_text;
  }

  return [request.requested_date, request.requested_time].filter(Boolean).join(" ") || "Missing";
}

function formatMissingField(value: string) {
  return value.replaceAll("_", " ");
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
