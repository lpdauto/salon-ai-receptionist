import { resolveDashboardBusinessId } from "@/lib/dashboard-data";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const businessId = await resolveDashboardBusinessId();
  let business: unknown = null;
  let services: unknown = null;
  let requests: unknown = null;

  if (supabase) {
    const [businessResult, servicesResult, requestsResult] = await Promise.all([
      supabase
        .from("businesses")
        .select("id,name,phone,timezone")
        .eq("id", businessId)
        .maybeSingle(),
      supabase
        .from("services")
        .select("id,name,category,price_cents,is_active", { count: "exact" })
        .eq("business_id", businessId)
        .order("created_at", { ascending: true })
        .limit(5),
      supabase
        .from("appointment_requests")
        .select("id,status", { count: "exact" })
        .eq("business_id", businessId)
        .limit(1),
    ]);

    business = {
      data: businessResult.data,
      error: safeError(businessResult.error),
    };
    services = {
      count: servicesResult.count,
      sample: servicesResult.data,
      error: safeError(servicesResult.error),
    };
    requests = {
      count: requestsResult.count,
      error: safeError(requestsResult.error),
    };
  }

  return Response.json({
    hasNextPublicSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasDefaultBusinessId: Boolean(process.env.DEFAULT_BUSINESS_ID || process.env.NEXT_PUBLIC_DEFAULT_BUSINESS_ID),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasTwilioSid: Boolean(process.env.TWILIO_ACCOUNT_SID),
    hasTwilioToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
    hasTwilioPhone: Boolean(process.env.TWILIO_PHONE_NUMBER),
    isSupabaseAdminConfigured: isSupabaseAdminConfigured(),
    businessId,
    business,
    services,
    requests,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
}

function safeError(error: { message?: string; code?: string; details?: string } | null) {
  if (!error) {
    return null;
  }

  return {
    code: error.code,
    message: error.message,
    details: error.details,
  };
}
