import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
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
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
}
