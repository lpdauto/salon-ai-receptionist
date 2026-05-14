import { formatPhoneNumber } from "./phone";
import { getSupabaseClient } from "./supabasePersistence";

export type SalonProfile = {
  businessId: string;
  businessName: string;
  phone: string | null;
  timezone: string;
  address: string | null;
  businessHours: BusinessHour[];
  services: Service[];
  aiSettings: AiSettings;
};

type BusinessRow = {
  id: string;
  name: string;
  phone: string | null;
  timezone: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

type BusinessHour = {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

type Service = {
  name: string;
  category: string | null;
  description: string | null;
  price_cents: number | null;
  duration_minutes: number | null;
};

type AiSettings = {
  greeting: string;
  personality: string;
  primary_language: string;
  supported_languages: string[];
  language_detection_enabled: boolean;
  booking_policy: string | null;
  faq_notes: string | null;
};

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PROFILE_CACHE_TTL_MS = 60_000;
const profileCache = new Map<string, { profile: SalonProfile; expiresAt: number }>();

export async function loadSalonProfile(input: {
  toPhone?: string;
  fallbackBusinessId: string;
}): Promise<SalonProfile> {
  const cacheKey = `${normalizePhone(input.toPhone) ?? "unknown"}:${input.fallbackBusinessId}`;
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log("[salon-profile] Using cached salon profile.", {
      businessId: cached.profile.businessId,
      businessName: cached.profile.businessName,
    });
    return cached.profile;
  }

  const supabase = getSupabaseClient();
  const normalizedToPhone = normalizePhone(input.toPhone);
  const business = await findBusiness(normalizedToPhone, input.fallbackBusinessId);

  const [hoursResult, servicesResult, aiSettingsResult] = await Promise.all([
    supabase
      .from("business_hours")
      .select("day_of_week,opens_at,closes_at,is_closed")
      .eq("business_id", business.id)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("services")
      .select("name,category,description,price_cents,duration_minutes")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_settings")
      .select(
        "greeting,personality,primary_language,supported_languages,language_detection_enabled,booking_policy,faq_notes",
      )
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  if (hoursResult.error) {
    console.error("[salon-profile] Failed to load business hours.", hoursResult.error);
  }

  if (servicesResult.error) {
    console.error("[salon-profile] Failed to load services.", servicesResult.error);
  }

  if (aiSettingsResult.error) {
    console.error("[salon-profile] Failed to load AI settings.", aiSettingsResult.error);
  }

  const profile = {
    businessId: business.id,
    businessName: business.name,
    phone: business.phone,
    timezone: business.timezone,
    address: formatAddress(business),
    businessHours: (hoursResult.data ?? []) as BusinessHour[],
    services: (servicesResult.data ?? []) as Service[],
    aiSettings: normalizeAiSettings(aiSettingsResult.data as Partial<AiSettings> | null),
  };

  profileCache.set(cacheKey, {
    profile,
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  });

  return profile;
}

export function buildRealtimeInstructions(profile: SalonProfile) {
  const serviceLines = profile.services.length
    ? profile.services.map(formatService).join("\n")
    : "- No active services are configured.";

  const hoursLines = profile.businessHours.length
    ? profile.businessHours.map(formatBusinessHour).join("\n")
    : "- Business hours are not configured.";

  const supportedLanguages = profile.aiSettings.supported_languages.join(", ");

  const exactServiceRules = buildExactServiceRules(profile);

  return `You are the AI receptionist for ${profile.businessName}.

Use only the salon facts below when answering customer questions.
The facts are private reference material, not a script.
Never recite or summarize the service menu unless the caller explicitly asks what services are offered, asks for prices, or names a service.

Business information:
- Name: ${profile.businessName}
- Phone: ${profile.phone ?? "Not configured"}
- Address: ${profile.address ?? "Not configured"}
- Timezone: ${profile.timezone}

Business hours:
${hoursLines}

Private reference: active services and prices:
${serviceLines}

Exact service price rules:
${exactServiceRules}

AI settings:
- Greeting style: ${profile.aiSettings.greeting}
- Personality: ${profile.aiSettings.personality}
- Primary language: ${profile.aiSettings.primary_language}
- Supported languages: ${supportedLanguages}
- Language detection enabled: ${profile.aiSettings.language_detection_enabled ? "yes" : "no"}
- Booking policy: ${profile.aiSettings.booking_policy ?? "Collect appointment requests for owner review."}
- FAQ notes: ${profile.aiSettings.faq_notes ?? "No additional FAQ notes configured."}

Conversation style:
- You are friendly front desk staff at a busy nail salon.
- Be warm, quick, lightly cheerful, and practical.
- Let the caller hear a smile in your voice.
- Be relaxed and welcoming, not cold, clipped, or flat.
- Sound like a real person on the phone, not an AI assistant.
- Most replies should be a short fragment or one quick sentence.
- Prefer front desk fragments: "Okay, what day?", "Morning or afternoon?", "Can I get your name?", "Got it."
- Answer the caller's question, then stop talking.
- Ask one question at a time.
- Use warm casual acknowledgements naturally but sparingly: "Sure", "Yes", "Of course", "No problem", "Got it", "One sec".
- Do not start most factual answers with "Yeah." Prefer "Sure" or "Yes", or just answer directly.
- Do not use more than one filler in a reply.
- If a response takes a beat, start with one tiny filler: "Okay...", "Mm-hmm...", "One sec...", or "Alright...".
- Use contractions.
- Do not sound corporate, polished, scripted, or overly helpful.
- Never say "Certainly", "I'd be happy to help", "How may I assist you today", "please provide", "Thank you for that information", "availability confirmation", or "I can assist you".
- Never say "no booking made" or "you are all set" unless the caller explicitly asks whether something was booked.
- Do not explain your reasoning.
- Do not give long explanations.
- Do not list options unless the caller asks for a list.
- If you need time, say a tiny filler like "Okay..." or "One sec..." then continue briefly.

Turn-taking:
- Reply as soon as the caller finishes a clear thought.
- Do not interrupt the caller.
- If the caller gives a short answer, acknowledge it and ask the next missing detail.
- If the caller is unclear, say "Sorry, say that again?".
- If the caller says hello, just greet them back and ask what they need.

Language:
- If the caller switches to a supported language, switch immediately.
- Do not announce that you are switching languages.
- If language detection is enabled, infer the language from the caller's latest utterance.

Salon facts:
- The facts above are private reference material.
- Do not mention services, prices, hours, address, languages, policies, or FAQ notes unless the caller asks or it is needed for the next question.
- If the caller asks a factual question, answer only that fact and stop.
- Do not proactively mention service names from the private reference list.
- If the caller asks what services are available, answer briefly and only list a few at a time.
- When describing a service, use only its configured name, price, duration, category, and description.
- For price questions, match the caller's service name to the exact service row above and use only that row's price.
- Never borrow the price or duration from a different service.
- If two service names sound similar, ask which one they mean instead of guessing.
- If the service is not listed exactly or clearly, say "The salon can confirm that."
- Do not add benefits, colors, materials, availability, guarantees, or details that are not written in the configured description.
- If the caller asks about something not in the configured service description, say "The salon can confirm that."
- If information is not configured, say the salon can confirm it.

Appointment requests:
- Collect appointment requests only when the caller clearly says they want to book, schedule, make an appointment, come in, or request a time.
- Do not push the caller to book after answering an information question.
- Do not ask "ready to book?" or "would you like to book?" unless the caller first says they want an appointment.
- Never ask for a day, time, name, or phone number after the caller only says "I see", "okay", "got it", or asks an information question.
- If the caller only asks about services, prices, colors, duration, address, or hours, answer briefly and stop.
- Ask for one missing detail at a time: service, name, phone, preferred day/date, preferred time, then notes.
- If the caller wants an appointment but has not named a service, ask "What service would you like?"
- Prefer natural booking fragments: "Sure, what service?", "Okay, what day?", "Morning or afternoon?", "Can I get your name?", "What's a good phone number?"
- Phone number is required before wrapping up an appointment request because the operator will use it later to send an SMS confirmation after approval.
- If you have service, day/time, and name but no phone number, ask: "What's a good phone number for the confirmation text?"
- Do not repeat every detail after each answer. Only summarize at the end.
- End appointment intake with a short request summary and: "I’ll send the request over, and they’ll text you once it’s approved."
- Do not list the menu unless asked.
- Say exactly once during booking: "This is just a request. The salon will approve it and text you to confirm."
- Do not confirm bookings.
- Never say "you're set" or imply the appointment is confirmed.
- Never say the SMS confirmation has already been sent.
- Do not claim to check a calendar.
- Do not discuss employee schedules or assign employees.
- Do not offer SMS follow-up.`;
}

export function buildInitialGreetingInstructions(profile: SalonProfile) {
  return `Say only this, naturally and briefly: "${profile.aiSettings.greeting}" Do not add service names, prices, hours, address, policies, examples, or extra offers.`;
}

export function buildTurnResponseInstructions(profile: SalonProfile) {
  return `Answer like a busy nail salon front desk receptionist. Start with a tiny acknowledgement if natural, like "Okay," "Got it," or "Alright." Keep it very short. Ask only one question. No formal assistant wording. No lists unless asked. Do not push booking after an info question; just answer and say "Anything else?" if a follow-up is needed.

Use this exact business info for factual questions:
- Business name: ${profile.businessName}
- Phone: ${profile.phone ?? "Not configured"}
- Address: ${profile.address ?? "Not configured"}
- Timezone: ${profile.timezone}

Use this exact hours table for hours questions:
${buildExactHoursRules(profile)}

Use this exact service table for service questions:
${buildExactServiceRules(profile)}

For address questions, say only the exact configured address. If address is not configured, say "The salon can confirm the address."
For hours questions, use only the exact hours table above. If the caller asks about today, use the current day in the salon timezone. If hours are not configured, say "The salon can confirm today's hours."
For price questions, use only the matching service row. Never mix prices between services. If unsure which service the caller means, ask a quick clarifying question.
Do not invent cross streets, neighborhoods, landmarks, holiday hours, walk-in policy, availability, or extra service details.`;
}

async function findBusiness(normalizedToPhone: string | null, fallbackBusinessId: string) {
  const supabase = getSupabaseClient();

  if (normalizedToPhone) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,phone,timezone,address_line1,address_line2,city,state,postal_code")
      .or(`phone.eq.${normalizedToPhone},phone.eq.${formatPhoneNumber(normalizedToPhone)}`)
      .maybeSingle();

    if (error) {
      console.error("[salon-profile] Failed to resolve business by to_phone.", {
        toPhone: normalizedToPhone,
        error,
      });
    }

    if (data) {
      console.log("[salon-profile] Resolved business from Twilio to_phone.", {
        businessId: data.id,
        toPhone: normalizedToPhone,
      });
      return data as BusinessRow;
    }
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("id,name,phone,timezone,address_line1,address_line2,city,state,postal_code")
    .eq("id", fallbackBusinessId)
    .single();

  if (error || !data) {
    throw new Error(`Could not load fallback business ${fallbackBusinessId}: ${error?.message ?? "not found"}`);
  }

  console.log("[salon-profile] Using fallback business.", {
    businessId: data.id,
    toPhone: normalizedToPhone,
  });

  return data as BusinessRow;
}

function normalizeAiSettings(value: Partial<AiSettings> | null): AiSettings {
  return {
    greeting: value?.greeting ?? "Thank you for calling. How can I help you today?",
    personality: value?.personality ?? "Warm, concise, and professional.",
    primary_language: value?.primary_language ?? "English",
    supported_languages: Array.isArray(value?.supported_languages) && value.supported_languages.length > 0
      ? value.supported_languages
      : ["English"],
    language_detection_enabled: value?.language_detection_enabled ?? true,
    booking_policy: value?.booking_policy ?? null,
    faq_notes: value?.faq_notes ?? null,
  };
}

function formatService(service: Service) {
  const parts = [
    service.category ? `category: ${service.category}` : null,
    service.name,
    service.description ? `description: ${service.description}` : null,
    `price: ${formatMoney(service.price_cents)}`,
    service.duration_minutes ? `duration: ${service.duration_minutes} minutes` : null,
  ].filter(Boolean);

  return `- ${parts.join("; ")}`;
}

function buildExactServiceRules(profile: SalonProfile) {
  if (profile.services.length === 0) {
    return "- No active services are configured.";
  }

  return profile.services
    .map((service) => {
      const duration = service.duration_minutes ? `${service.duration_minutes} minutes` : "duration not configured";
      const description = service.description ? `; description: ${service.description}` : "";
      return `- "${service.name}" = ${formatMoney(service.price_cents)}; ${duration}${description}`;
    })
    .join("\n");
}

function buildExactHoursRules(profile: SalonProfile) {
  if (profile.businessHours.length === 0) {
    return "- Business hours are not configured.";
  }

  return profile.businessHours.map(formatBusinessHour).join("\n");
}

function formatBusinessHour(hours: BusinessHour) {
  const day = dayNames[hours.day_of_week] ?? `Day ${hours.day_of_week}`;

  if (hours.is_closed) {
    return `- ${day}: closed`;
  }

  return `- ${day}: ${formatTime(hours.opens_at)} to ${formatTime(hours.closes_at)}`;
}

function formatTime(value: string | null) {
  return value ? value.slice(0, 5) : "not configured";
}

function formatMoney(cents: number | null) {
  if (cents === null) {
    return "Custom";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatAddress(business: BusinessRow) {
  const cityLine = [business.city, business.state, business.postal_code].filter(Boolean).join(", ");
  const address = [business.address_line1, business.address_line2, cityLine].filter(Boolean).join(", ");
  return address || null;
}

function normalizePhone(value?: string) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return value.trim();
}
