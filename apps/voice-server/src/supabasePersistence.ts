import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AppointmentRequestExtraction } from "./appointmentExtraction";

export type CallTrackingInput = {
  businessId: string;
  twilioCallSid?: string;
  fromPhone?: string;
  toPhone?: string;
  status: "completed" | "failed";
  startedAt?: Date;
  endedAt: Date;
  unresolved: boolean;
  summary: string;
};

export type AppointmentRequestInput = {
  businessId: string;
  callId: string | null;
  extraction: AppointmentRequestExtraction;
  fallbackCustomerPhone?: string;
};

let supabase: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (supabase) {
    return supabase;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for voice-server persistence.");
  }

  supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

export async function saveCallTracking(input: CallTrackingInput) {
  console.log("[supabase] Saving calls row.", {
    twilioCallSid: input.twilioCallSid,
    fromPhone: input.fromPhone,
    toPhone: input.toPhone,
    status: input.status,
    unresolved: input.unresolved,
  });

  const { data, error } = await getSupabaseClient()
    .from("calls")
    .insert({
      business_id: input.businessId,
      twilio_call_sid: input.twilioCallSid ?? null,
      from_phone: input.fromPhone ?? null,
      to_phone: input.toPhone ?? null,
      direction: "inbound",
      status: input.status,
      started_at: input.startedAt?.toISOString() ?? null,
      ended_at: input.endedAt.toISOString(),
      unresolved: input.unresolved,
      summary: input.summary,
      transcript: null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[supabase] Failed to save calls row.", error);
    return null;
  }

  console.log("[supabase] Saved calls row.", {
    callId: data.id,
  });

  return data.id as string;
}

export async function saveAppointmentRequest(input: AppointmentRequestInput) {
  const extraction = input.extraction;
  const normalizedTime = normalizeTimeForPostgres(extraction.requested_time);
  const notes = [
    extraction.notes,
    extraction.requested_day ? `Requested day: ${extraction.requested_day}` : null,
    extraction.requested_time && !normalizedTime ? `Requested time: ${extraction.requested_time}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  console.log("[supabase] Saving appointment_requests row.", {
    callId: input.callId,
    customerName: extraction.customer_name,
    requestedService: extraction.requested_service,
    requestedDate: extraction.requested_date,
    requestedDay: extraction.requested_day,
    requestedTime: extraction.requested_time,
  });

  const { data, error } = await getSupabaseClient()
    .from("appointment_requests")
    .insert({
      business_id: input.businessId,
      call_id: input.callId,
      customer_name: extraction.customer_name,
      customer_phone: extraction.customer_phone ?? input.fallbackCustomerPhone ?? null,
      requested_service: extraction.requested_service,
      requested_date: extraction.requested_date,
      requested_day: extraction.requested_day,
      requested_time: normalizedTime,
      notes: notes || null,
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[supabase] Failed to save appointment_requests row.", error);
    return null;
  }

  console.log("[supabase] Saved appointment_requests row.", {
    appointmentRequestId: data.id,
  });

  return data.id as string;
}

function normalizeTimeForPostgres(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const hhmm = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (hhmm) {
    return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}:00`;
  }

  const amPm = trimmed.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (!amPm) {
    return null;
  }

  let hour = Number(amPm[1]);
  const minute = amPm[2] ?? "00";
  const period = amPm[3].toLowerCase();

  if (period === "pm" && hour < 12) {
    hour += 12;
  }

  if (period === "am" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${minute}:00`;
}
