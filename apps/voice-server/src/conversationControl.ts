import { SalonProfile } from "./salonProfile";

const bookingTerms = /\b(book|booking|schedule|appointment|come in|available|availability|reserve|set up|make an appointment)\b/i;
const priceTerms = /\b(price|prices|cost|how much|charge|charges|rate|rates)\b/i;
const hoursTerms = /\b(hours|open|close|closed|closing|what time|when are you)\b/i;
const addressTerms = /\b(address|located|location|where are you|where is|directions)\b/i;
const phoneTerms = /\b(phone|number|call back|callback)\b/i;
const menuTerms = /\b(services|menu|what do you do|offer|offers)\b/i;
const durationTerms = /\b(how long|duration|take|takes|minutes|hour|hours)\b/i;
const acknowledgementOnlyTerms = /^(i see|okay|ok|got it|alright|all right|sounds good|cool|great|nice|mm hmm|mhm|yeah|yes|yep)$/i;

type ConversationControlOptions = {
  didMentionRequestPolicy?: boolean;
};

export function buildControlledTurnInstructions(
  profile: SalonProfile,
  customerText: string,
  options: ConversationControlOptions = {},
) {
  const base = buildBaseTurnInstructions(profile);
  const hint = buildIntentHint(profile, customerText, options);
  return hint ? `${base}\n\nLatest caller message: "${customerText}"\n\nFor this turn:\n${hint}` : base;
}

function buildBaseTurnInstructions(profile: SalonProfile) {
  return `Answer like a friendly nail salon front desk receptionist.
- Sound warm, lightly cheerful, and welcoming.
- Use a smile in the voice, but keep it natural.
- Be helpful and relaxed, not cold or clipped.
- Keep it short, usually a fragment or one quick sentence.
- Prefer front desk fragments: "Okay, what day?", "Morning or afternoon?", "Can I get your name?", "Got it."
- Answer the question, then stop talking.
- Ask one question at a time.
- Use warm casual wording sparingly: "Sure," "Yes," "Of course," "No problem," "Got it," "One sec."
- Do not start most factual answers with "Yeah." Prefer "Sure" or "Yes", or just answer directly.
- Do not use more than one filler in a reply.
- If the response takes a beat, start with one tiny filler: "Okay...", "Mm-hmm...", "One sec...", or "Alright...".
- Do not sound annoyed, dismissive, flat, or rushed.
- Do not say "Certainly", "I'd be happy to help", "How may I assist you today", "please provide", "Thank you for that information", "availability confirmation", or "I can assist you".
- Do not say "no booking made", "you are all set", or anything that sounds like closing a support ticket.
- Do not pitch booking after an info question.
- Never ask for a day, time, name, or phone number unless the caller clearly asked to book, schedule, or make an appointment.
- Do not add "Anything else?" after exact fact answers unless the caller seems done and a follow-up is needed.
- Do not list services, prices, hours, address, or policies unless the caller asked.
- Use only the exact facts below.

Exact business info:
- Business name: ${profile.businessName}
- Phone: ${profile.phone ?? "Not configured"}
- Address: ${profile.address ?? "Not configured"}
- Timezone: ${profile.timezone}

Exact hours:
${formatHours(profile)}

Exact active services:
${formatServices(profile)}`;
}

function buildIntentHint(profile: SalonProfile, customerText: string, options: ConversationControlOptions) {
  const normalized = normalize(customerText);

  if (acknowledgementOnlyTerms.test(normalized)) {
    return `The caller only acknowledged the last answer. Do not introduce booking, services, prices, hours, address, or policies. Either stay very brief with "Sure." or say nothing extra.`;
  }

  if (addressTerms.test(customerText)) {
    return profile.address
      ? `Say the address warmly and naturally, like: "Sure, we're at ${profile.address}." Then stop. Do not add landmarks, directions, parking, services, hours, or booking prompts.`
      : `Say: "The salon can confirm the address." Do not add anything else.`;
  }

  if (hoursTerms.test(customerText)) {
    return buildHoursHint(profile, customerText);
  }

  if (phoneTerms.test(customerText)) {
    return profile.phone
      ? `Say the phone number warmly and naturally, like: "Sure, it's ${profile.phone}." Then stop. Do not add extra help or booking prompts.`
      : `Say: "The salon can confirm the phone number." Do not add anything else.`;
  }

  if (priceTerms.test(customerText)) {
    const service = findMentionedService(profile, normalized, { allowCategoryOnlyMatch: false });
    if (service) {
      return `The caller asked about price. Say it warmly, like: "Sure, ${service.name} is ${formatMoney(service.price_cents)}." Then stop. Do not ask to book.`;
    }

    return `The caller asked about price, but the service is unclear. Ask one warm short clarifying question, like "Sure, which service was that for?" Do not list the menu.`;
  }

  const service = findMentionedService(profile, normalized, { allowCategoryOnlyMatch: false });
  if (service && !bookingTerms.test(customerText)) {
    if (durationTerms.test(customerText)) {
      const duration = service.duration_minutes ? `${service.duration_minutes} minutes` : "The salon can confirm that.";
      return `The caller asked how long "${service.name}" takes. Say it warmly, like: "That one's about ${duration}." Then stop. Do not ask to book.`;
    }

    const description = service.description ? ` ${service.description}` : "";
    return `The caller mentioned "${service.name}" but did not clearly ask to book. Answer warmly using only this row: ${service.name}, ${formatMoney(service.price_cents)}, ${service.duration_minutes ? `${service.duration_minutes} minutes` : "duration not configured"}.${description ? ` Description: ${description.trim()}` : ""} Keep it brief, then stop. Do not ask to book.`;
  }

  if (menuTerms.test(customerText)) {
    const menuServices = servicesForMenuQuestion(profile, normalized);
    const names = (menuServices.length ? menuServices : profile.services).slice(0, 4).map((item) => item.name).join(", ");
    return names
      ? `The caller asked about services. Warmly name only a few services: ${names}. Then ask "Was there one you had in mind?" Do not read the full menu.`
      : `Say: "The salon can confirm the service menu." Do not add anything else.`;
  }

  const categoryServices = servicesForMenuQuestion(profile, normalized);
  if (categoryServices.length > 1) {
    const names = categoryServices.slice(0, 4).map((item) => item.name).join(", ");
    return `The caller asked about a service category. Say warmly: "Sure, for that we have ${names}." Then stop. Do not say there are no other types unless the exact configured list is empty. Do not ask to book.`;
  }

  if (bookingTerms.test(customerText)) {
    const policyLine = options.didMentionRequestPolicy
      ? `Do not repeat the request/confirmation disclaimer.`
      : `Say this once if the caller is starting an appointment request: "This is just a request. The salon will approve it and text you to confirm."`;

    return `The caller wants an appointment. Sound warm and helpful, like salon front desk staff. ${policyLine} Collect every required detail before wrapping up: service, preferred day/time, name, and phone number. Phone number is required so the operator can text the appointment confirmation after approval. Ask one missing detail at a time. If they gave service/day/time/name but not phone, your next question must be "What's a good phone number for the confirmation text?" Use short fragments like "Sure, what service?", "Okay, what day?", "Morning or afternoon?", "Can I get your name?", "What's a good phone number for the confirmation text?", and at the end, "Got it. I’ll send the request over, and they’ll text you once it’s approved." Do not say "you're set." Do not say the appointment is confirmed. Do not say the salon will text immediately. Do not summarize until service, day/time, name, and phone are all collected. Do not claim to check availability. Do not list services unless they ask.`;
  }

  return `Answer only the latest question. Keep it warm, casual, and short. Then stop. Do not introduce services, prices, hours, address, policies, or booking unless the caller asked.`;
}

function buildHoursHint(profile: SalonProfile, customerText: string) {
  const day = mentionedDay(customerText) ?? (/\btoday\b/i.test(customerText) ? currentDayName(profile.timezone) : null);
  if (!day) {
    return `The caller asked about hours. Give a warm short answer from the exact hours table. Then stop. Do not mention services or booking.`;
  }

  const hours = profile.businessHours.find((item) => dayName(item.day_of_week).toLowerCase() === day.toLowerCase());
  if (!hours) {
    return `Say: "The salon can confirm ${day}'s hours." Do not add anything else.`;
  }

  if (hours.is_closed) {
    return `Say warmly: "We're closed ${day}." Then stop. Do not add services or booking prompts.`;
  }

  return `Say warmly: "Yes, ${day} we're open ${formatTime(hours.opens_at)} to ${formatTime(hours.closes_at)}." Then stop. Do not add services or booking prompts.`;
}

function findMentionedService(
  profile: SalonProfile,
  normalizedText: string,
  options: { allowCategoryOnlyMatch?: boolean } = {},
) {
  const scored = profile.services
    .map((service) => {
      const serviceName = normalize(service.name);
      if (normalizedText.includes(serviceName)) {
        return { service, score: 100 + serviceName.length };
      }

      const aliases = serviceAliases(service);
      if (aliases.some((alias) => normalizedText.includes(alias))) {
        return { service, score: 80 };
      }

      const category = normalize(service.category ?? "");
      if (options.allowCategoryOnlyMatch && category && normalizedText.includes(category)) {
        return { service, score: 30 };
      }

      const words = serviceName.split(" ").filter((word) => word.length > 2);
      const matches = words.filter((word) => word !== category && normalizedText.includes(word)).length;
      return { service, score: matches };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return null;
  }

  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return null;
  }

  return scored[0].service;
}

function servicesForMenuQuestion(profile: SalonProfile, normalizedText: string) {
  const categoryMatches = profile.services.filter((service) => {
    const category = normalize(service.category ?? "");
    if (category && normalizedText.includes(category)) {
      return true;
    }

    if (/\bmanicures?\b/.test(normalizedText)) {
      const name = normalize(service.name);
      return category === "manicure" || name.includes("manicure") || name.includes("acrylic");
    }

    if (/\bacrylics?\b|\bfills?\b/.test(normalizedText)) {
      const name = normalize(service.name);
      return name.includes("acrylic") || name.includes("fill");
    }

    return false;
  });

  return categoryMatches;
}

function serviceAliases(service: { name: string }) {
  const name = normalize(service.name);
  const aliases: string[] = [];

  if (name.includes("acrylic full set")) {
    aliases.push("acrylic", "full set", "acrylics");
  }

  if (name.includes("acrylic fill")) {
    aliases.push("fill", "fills", "acrylic fill", "acrylic fills");
  }

  if (name.includes("gel manicure")) {
    aliases.push("gel", "gel mani", "gel manicure");
  }

  if (name.includes("pedicure")) {
    aliases.push("pedi", "pedicure");
  }

  return aliases;
}

function formatServices(profile: SalonProfile) {
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

function formatHours(profile: SalonProfile) {
  if (profile.businessHours.length === 0) {
    return "- Business hours are not configured.";
  }

  return profile.businessHours.map((hours) => {
    const day = dayName(hours.day_of_week);
    if (hours.is_closed) {
      return `- ${day}: closed`;
    }

    return `- ${day}: ${formatTime(hours.opens_at)} to ${formatTime(hours.closes_at)}`;
  }).join("\n");
}

function mentionedDay(text: string) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].find((day) =>
    new RegExp(`\\b${day}\\b`, "i").test(text),
  ) ?? null;
}

function currentDayName(timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone,
  }).format(new Date());
}

function dayName(dayOfWeek: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek] ?? `Day ${dayOfWeek}`;
}

function formatTime(value: string | null) {
  if (!value) {
    return "not configured";
  }

  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value.slice(0, 5);
  }

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatMoney(cents: number | null) {
  if (cents === null) {
    return "custom priced";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
