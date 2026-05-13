import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalDashboardData } from "@/lib/local-dashboard-store";

export type Business = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  timezone: string;
};

export type BusinessHour = {
  id: string;
  business_id: string;
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

export type ServiceCategory = {
  id: string;
  business_id: string;
  slug: string;
  name: string;
  sort_order: number;
};

export type Service = {
  id: string;
  category: string;
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
  businessHours: BusinessHour[];
  serviceCategories: ServiceCategory[];
  services: Service[];
  aiSettings: AiSettings;
  calls: CallRecord[];
  appointmentRequests: AppointmentRequest[];
  isConnected: boolean;
};

const TEST_BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_SERVICE_CATEGORIES = [
  { slug: "manicure", name: "Manicure", sort_order: 10 },
  { slug: "pedicure", name: "Pedicure", sort_order: 20 },
  { slug: "extensions", name: "Extensions", sort_order: 30 },
  { slug: "eyebrows", name: "Eyebrows", sort_order: 40 },
  { slug: "extras", name: "Extras", sort_order: 50 },
  { slug: "lash-brows", name: "Lash & Brows", sort_order: 60 },
];

export const fallbackData: DashboardData = {
  isConnected: false,
  business: {
    id: TEST_BUSINESS_ID,
    name: "Luxe Nail Studio",
    slug: "luxe-nail-studio",
    phone: "+16265550100",
    address_line1: "123 Main Street",
    address_line2: null,
    city: "Pasadena",
    state: "CA",
    postal_code: "91101",
    timezone: "America/Los_Angeles",
  },
  businessHours: DAYS_OF_WEEK.map((day) => ({
    id: `hours-${day}`,
    business_id: TEST_BUSINESS_ID,
    day_of_week: day,
    opens_at: day === 0 ? null : "09:00",
    closes_at: day === 0 ? null : "18:00",
    is_closed: day === 0,
  })),
  serviceCategories: DEFAULT_SERVICE_CATEGORIES.map((category) => ({
    id: `category-${category.slug}`,
    business_id: TEST_BUSINESS_ID,
    ...category,
  })),
  services: [
    {
      id: "service-1",
      category: "manicure",
      name: "Gel Manicure",
      description: "Long-wear gel polish manicure.",
      price_cents: 4500,
      duration_minutes: 45,
      is_active: true,
    },
    {
      id: "service-2",
      category: "pedicure",
      name: "Classic Pedicure",
      description: "Foot soak, nail care, massage, and polish.",
      price_cents: 5000,
      duration_minutes: 50,
      is_active: true,
    },
    {
      id: "service-3",
      category: "extensions",
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
    return getLocalDashboardData();
  }

  const businessId = await resolveDashboardBusinessId();

  const [
    businessResult,
    hoursResult,
    categoriesResult,
    servicesResult,
    aiSettingsResult,
    callsResult,
    requestsResult,
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id,name,slug,phone,address_line1,address_line2,city,state,postal_code,timezone")
      .eq("id", businessId)
      .single(),
    supabase
      .from("business_hours")
      .select("id,business_id,day_of_week,opens_at,closes_at,is_closed")
      .eq("business_id", businessId)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("service_categories")
      .select("id,business_id,slug,name,sort_order")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("services")
      .select("id,category,name,description,price_cents,duration_minutes,is_active")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_settings")
      .select(
        "greeting,personality,primary_language,supported_languages,language_detection_enabled,voice_name,escalation_phone,booking_policy,faq_notes",
      )
      .eq("business_id", businessId)
      .single(),
    supabase
      .from("calls")
      .select(
        "id,twilio_call_sid,from_phone,to_phone,direction,status,transcript,summary,unresolved,created_at",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("appointment_requests")
      .select(
        "id,customer_name,customer_phone,requested_service,requested_date,requested_time,notes,status,created_at",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (businessResult.error) {
    return fallbackData;
  }

  return {
    isConnected: true,
    business: businessResult.data ?? fallbackData.business,
    businessHours: normalizeBusinessHours(
      businessId,
      hoursResult.data,
      fallbackData.businessHours,
    ),
    serviceCategories: normalizeServiceCategories(
      businessId,
      categoriesResult.data,
      dataServiceCategories(businessId, servicesResult.data),
    ),
    services: normalizeList(servicesResult.data, fallbackData.services),
    aiSettings: aiSettingsResult.data ?? fallbackData.aiSettings,
    calls: normalizeList(callsResult.data, fallbackData.calls),
    appointmentRequests: normalizeList(
      requestsResult.data,
      fallbackData.appointmentRequests,
    ),
  };
}

function normalizeServiceCategories(
  businessId: string,
  value: ServiceCategory[] | null,
  serviceDerivedCategories: ServiceCategory[],
) {
  if (value && value.length > 0) {
    return value;
  }

  const defaultCategories = DEFAULT_SERVICE_CATEGORIES.map((category) => ({
    id: `category-${category.slug}`,
    business_id: businessId,
    ...category,
  }));

  const merged = [...defaultCategories];
  for (const category of serviceDerivedCategories) {
    if (!merged.some((existing) => existing.slug === category.slug)) {
      merged.push(category);
    }
  }

  return merged.sort((a, b) => a.sort_order - b.sort_order);
}

function dataServiceCategories(businessId: string, services: Service[] | null) {
  if (!services) {
    return [];
  }

  return Array.from(new Set(services.map((service) => service.category || "manicure"))).map((slug, index) => ({
    id: `category-${slug}`,
    business_id: businessId,
    slug,
    name: titleFromSlug(slug),
    sort_order: 100 + index,
  }));
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function resolveDashboardBusinessId() {
  const configuredBusinessId =
    process.env.DEFAULT_BUSINESS_ID ?? process.env.NEXT_PUBLIC_DEFAULT_BUSINESS_ID;

  if (configuredBusinessId) {
    return configuredBusinessId;
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return TEST_BUSINESS_ID;
  }

  const { data } = await supabase
    .from("businesses")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? TEST_BUSINESS_ID;
}

function normalizeBusinessHours(
  businessId: string,
  value: BusinessHour[] | null,
  fallback: BusinessHour[],
) {
  const source = value && value.length > 0 ? value : fallback;
  return DAYS_OF_WEEK.map((day) => {
    const existing = source.find((hours) => hours.day_of_week === day);
    return (
      existing ?? {
        id: `hours-${day}`,
        business_id: businessId,
        day_of_week: day,
        opens_at: null,
        closes_at: null,
        is_closed: true,
      }
    );
  });
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
