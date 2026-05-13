import { getDashboardData, formatMoney, BusinessHour } from "@/lib/dashboard-data";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const OPENAI_MODEL = process.env.OPENAI_TEST_CALL_MODEL ?? "gpt-4o-mini";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = readMessages(payload);
  if (!messages) {
    return Response.json(
      {
        error: "Expected messages: [{ role: 'user' | 'assistant', content: string }].",
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error: "OPENAI_API_KEY is not configured for the web app.",
      },
      { status: 500 },
    );
  }

  const data = await getDashboardData();
  const systemPrompt = buildReceptionistPrompt(data);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      console.error("[test-call] OpenAI request failed.", {
        status: response.status,
        body,
      });
      return Response.json(
        {
          error: "OpenAI could not generate a test-call reply.",
        },
        { status: 502 },
      );
    }

    const reply = readResponseText(body);
    if (!reply) {
      return Response.json(
        {
          error: "OpenAI returned an empty test-call reply.",
        },
        { status: 502 },
      );
    }

    return Response.json({ reply });
  } catch (error) {
    console.error("[test-call] API error:", error);
    return Response.json(
      {
        error: "The test-call simulator could not reach OpenAI.",
      },
      { status: 500 },
    );
  }
}

function readMessages(payload: unknown): IncomingMessage[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) {
    return null;
  }

  const normalized = messages
    .map((message) => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const value = message as { role?: unknown; content?: unknown };
      if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") {
        return null;
      }

      const content = value.content.trim();
      if (!content) {
        return null;
      }

      return {
        role: value.role,
        content,
      };
    })
    .filter((message): message is IncomingMessage => message !== null);

  return normalized.length > 0 ? normalized.slice(-12) : null;
}

function buildReceptionistPrompt(data: Awaited<ReturnType<typeof getDashboardData>>) {
  const activeServices = data.services.filter((service) => service.is_active);
  const serviceLines = activeServices.length
    ? activeServices
        .map((service) => {
          const parts = [
            `category: ${service.category || "manicure"}`,
            service.name,
            service.description ? `description: ${service.description}` : null,
            `price: ${formatMoney(service.price_cents)}`,
            service.duration_minutes ? `duration: ${service.duration_minutes} minutes` : null,
          ].filter(Boolean);

          return `- ${parts.join("; ")}`;
        })
        .join("\n")
    : "- No active services are configured.";

  const hoursLines = data.businessHours.map(formatBusinessHour).join("\n");
  const supportedLanguages = data.aiSettings.supported_languages.join(", ");
  const address = formatBusinessAddress(data.business);

  // This prompt is intentionally plain and easy to edit. It gives the simulator
  // only the configured salon facts, then adds behavioral rules that mirror the
  // phone receptionist MVP without touching Twilio or scheduling logic.
  return `You are the AI receptionist for ${data.business.name}.

Business information:
- Name: ${data.business.name}
- Phone: ${data.business.phone ?? "Not configured"}
- Address: ${address}
- Timezone: ${data.business.timezone}

Business hours:
${hoursLines}

Active services:
${serviceLines}

AI settings:
- Greeting style: ${data.aiSettings.greeting}
- Personality: ${data.aiSettings.personality}
- Primary language: ${data.aiSettings.primary_language}
- Supported languages: ${supportedLanguages}
- Language detection enabled: ${data.aiSettings.language_detection_enabled ? "yes" : "no"}

Rules:
- Keep replies short, friendly, and natural, like a phone receptionist.
- Answer using only the configured business info above.
- Do not invent prices, services, hours, policies, or availability.
- If the customer asks about something unknown, say the owner can confirm.
- Offer to help collect an appointment request.
- Do not confirm appointments. Say this is a request and the salon will confirm availability.
- If the customer's language is obvious and it is supported, reply in that language.
- If the customer wants an appointment, collect name, phone, service, preferred day/date, preferred time, and notes.`;
}

function formatBusinessHour(hours: BusinessHour) {
  const day = dayNames[hours.day_of_week] ?? `Day ${hours.day_of_week}`;

  if (hours.is_closed) {
    return `- ${day}: closed`;
  }

  return `- ${day}: ${formatTime(hours.opens_at)} to ${formatTime(hours.closes_at)}`;
}

function formatBusinessAddress(business: Awaited<ReturnType<typeof getDashboardData>>["business"]) {
  const cityLine = [business.city, business.state, business.postal_code].filter(Boolean).join(", ");
  const address = [business.address_line1, business.address_line2, cityLine].filter(Boolean).join(", ");
  return address || "Not configured";
}

function formatTime(value: string | null) {
  return value ? value.slice(0, 5) : "not configured";
}

function readResponseText(body: Record<string, unknown>) {
  if (typeof body.output_text === "string") {
    return body.output_text.trim();
  }

  const output = body.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) {
        return text.trim();
      }
    }
  }

  return null;
}
