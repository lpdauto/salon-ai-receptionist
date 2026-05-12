import { createAdminClient } from "@/lib/supabase/admin";

export type Business = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  timezone: string;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  duration_minutes: number | null;
  is_active: boolean;
};

export type AiSettings = {
  greeting: string;
  personality: string;
  primary_language: string;
  supported_languages: string[];
  language_detection_enabled: boolean;
  voice_name: string;
  escalation_phone: string | null;
  booking_policy: string | null;
  faq_notes: string | null;
};

export type CallRecord = {
  id: string;
  twilio_call_sid: string | null;
  from_phone: string | null;
  to_phone: string | null;
  direction: string;
  status: string;
  transcript: string | null;
  summary: string | null;
  unresolved: boolean;
  created_at: string;
};

export type AppointmentRequest = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  requested_service: string | null;
  requested_date: string | null;
  requested_time: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export type DashboardData = {
  business: Business;
  services: Service[];
  aiSettings: AiSettings;
  calls: CallRecord[];
  appointmentRequests: AppointmentRequest[];
  isConnected: boolean;
};

const TEST_BUSINESS_ID = "11111111-1111-1111-1111-111111111111";

const fallbackData: DashboardData = {
  isConnected: false,
  business: {
    id: TEST_BUSINESS_ID,
    name: "Luxe Nail Studio",
    slug: "luxe-nail-studio",
    phone: "+16265550100",
    timezone: "America/Los_Angeles",
  },
  services: [
    {
      id: "service-1",
      name: "Gel Manicure",
      description: "Long-wear gel polish manicure.",
      price_cents: 4500,
      duration_minutes: 45,
      is_active: true,
    },
    {
      id: "service-2",
      name: "Classic Pedicure",
      description: "Foot soak, nail care, massage, and polish.",
      price_cents: 5000,
      duration_minutes: 50,
      is_active: true,
    },
    {
      id: "service-3",
      name: "Acrylic Full Set",
      description: "Full acrylic extension set with polish.",
      price_cents: 7500,
      duration_minutes: 90,
      is_active: true,
    },
  ],
  aiSettings: {
    greeting: "Thank you for calling Luxe Nail Studio. How can I help you today?",
    personality: "Warm, calm, efficient, and respectful.",
    primary_language: "English",
    supported_languages: ["English", "Vietnamese", "Cantonese", "Mandarin"],
    language_detection_enabled: true,
    voice_name: "alloy",
    escalation_phone: "+16265550101",
    booking_policy:
      "Capture appointment requests for owner review. Do not confirm bookings yet.",
    faq_notes:
      "Ask for name, phone, service, preferred date/time, removal, and nail art.",
  },
  calls: [
    {
      id: "call-1",
      twilio_call_sid: "CA_demo_001",
      from_phone: "+16265551234",
      to_phone: "+16265550100",
      direction: "inbound",
      status: "completed",
      transcript: "Customer asked about gel manicure availability.",
      summary: "Potential gel manicure appointment request for Friday afternoon.",
      unresolved: true,
      created_at: new Date().toISOString(),
    },
  ],
  appointmentRequests: [
    {
      id: "request-1",
      customer_name: "Maya L.",
      customer_phone: "+16265551234",
      requested_service: "Gel Manicure",
      requested_date: null,
      requested_time: "15:00",
      notes: "Appointment request only. Needs owner confirmation.",
      status: "pending",
      created_at: new Date().toISOString(),
    },
  ],
};

function normalizeList<T>(value: T[] | null, fallback: T[]) {
  return value && value.length > 0 ? value : fallback;
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = createAdminClient();

  if (!supabase) {
    return fallbackData;
  }

  const [
    businessResult,
    servicesResult,
    aiSettingsResult,
    callsResult,
    requestsResult,
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id,name,slug,phone,timezone")
      .eq("id", TEST_BUSINESS_ID)
      .single(),
    supabase
      .from("services")
      .select("id,name,description,price_cents,duration_minutes,is_active")
      .eq("business_id", TEST_BUSINESS_ID)
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_settings")
      .select(
        "greeting,personality,primary_language,supported_languages,language_detection_enabled,voice_name,escalation_phone,booking_policy,faq_notes",
      )
      .eq("business_id", TEST_BUSINESS_ID)
      .single(),
    supabase
      .from("calls")
      .select(
        "id,twilio_call_sid,from_phone,to_phone,direction,status,transcript,summary,unresolved,created_at",
      )
      .eq("business_id", TEST_BUSINESS_ID)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("appointment_requests")
      .select(
        "id,customer_name,customer_phone,requested_service,requested_date,requested_time,notes,status,created_at",
      )
      .eq("business_id", TEST_BUSINESS_ID)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (businessResult.error) {
    return fallbackData;
  }

  return {
    isConnected: true,
    business: businessResult.data ?? fallbackData.business,
    services: normalizeList(servicesResult.data, fallbackData.services),
    aiSettings: aiSettingsResult.data ?? fallbackData.aiSettings,
    calls: normalizeList(callsResult.data, fallbackData.calls),
    appointmentRequests: normalizeList(
      requestsResult.data,
      fallbackData.appointmentRequests,
    ),
  };
}

export function formatMoney(cents: number | null) {
  if (cents === null) {
    return "Custom";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
