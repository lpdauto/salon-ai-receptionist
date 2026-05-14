import { createAdminClient } from "@/lib/supabase/admin";
import { sendTwilioSms } from "@/lib/twilio-sms";

type RequestRow = {
  id: string;
  business_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  requested_service: string | null;
  requested_date: string | null;
  requested_time: string | null;
  requested_datetime_text: string | null;
  businesses: {
    name: string;
  } | null;
};

export async function approveAppointmentRequest(requestId: string) {
  const { supabase, request } = await loadRequest(requestId);
  requirePhone(request);

  const dateTime = formatRequestedDateTime(request);
  await sendTwilioSms({
    to: request.customer_phone!,
    body: `Hi ${request.customer_name ?? "there"}, this is ${request.businesses?.name ?? "the salon"}. Your appointment request for ${request.requested_service ?? "your service"} on ${dateTime} is confirmed. See you then!`,
  });

  await supabase
    .from("appointment_requests")
    .update({
      status: "confirmed",
      needs_review: false,
      approved_at: new Date().toISOString(),
      contacted_at: new Date().toISOString(),
    })
    .eq("id", requestId);
}

export async function suggestNewTime(requestId: string, suggestedDatetimeText: string) {
  const { supabase, request } = await loadRequest(requestId);
  requirePhone(request);

  const suggested = suggestedDatetimeText.trim();
  if (!suggested) {
    throw new Error("Suggested date/time is required.");
  }

  await sendTwilioSms({
    to: request.customer_phone!,
    body: `Hi ${request.customer_name ?? "there"}, this is ${request.businesses?.name ?? "the salon"}. We received your request for ${request.requested_service ?? "your service"}. That time may not be available, but we can offer ${suggested}. Reply YES to confirm.`,
  });

  await supabase
    .from("appointment_requests")
    .update({
      status: "suggested_time",
      suggested_datetime_text: suggested,
      contacted_at: new Date().toISOString(),
    })
    .eq("id", requestId);
}

export async function markRequestContacted(requestId: string) {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  await supabase
    .from("appointment_requests")
    .update({
      status: "contacted",
      contacted_at: new Date().toISOString(),
    })
    .eq("id", requestId);
}

export async function archiveRequest(requestId: string) {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  await supabase
    .from("appointment_requests")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
    })
    .eq("id", requestId);
}

async function loadRequest(requestId: string) {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("appointment_requests")
    .select("id,business_id,customer_name,customer_phone,requested_service,requested_date,requested_time,requested_datetime_text,businesses(name)")
    .eq("id", requestId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Appointment request not found.");
  }

  return { supabase, request: data as unknown as RequestRow };
}

function requirePhone(request: RequestRow) {
  if (!request.customer_phone) {
    throw new Error("Customer phone number is required before sending SMS.");
  }
}

function formatRequestedDateTime(request: RequestRow) {
  if (request.requested_datetime_text) {
    return request.requested_datetime_text;
  }

  return [request.requested_date, request.requested_time].filter(Boolean).join(" ") || "the requested time";
}
