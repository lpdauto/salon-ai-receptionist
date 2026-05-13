export type TranscriptTurn = {
  role: "customer" | "assistant";
  text: string;
};

export type AppointmentRequestExtraction = {
  customer_name: string | null;
  customer_phone: string | null;
  requested_service: string | null;
  requested_date: string | null;
  requested_day: string | null;
  requested_time: string | null;
  notes: string | null;
  summary: string;
  unresolved: boolean;
};

const EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini";

export async function extractAppointmentRequest(
  apiKey: string,
  turns: TranscriptTurn[],
): Promise<AppointmentRequestExtraction> {
  const fallback = buildFallbackExtraction(turns);

  if (turns.length === 0) {
    return fallback;
  }

  if (!hasExplicitBookingIntent(turns)) {
    return {
      customer_name: null,
      customer_phone: null,
      requested_service: null,
      requested_date: null,
      requested_day: null,
      requested_time: null,
      notes: null,
      summary: "Caller asked for information but did not request an appointment.",
      unresolved: false,
    };
  }

  const transcriptText = turns.map((turn) => `${turn.role}: ${turn.text}`).join("\n");

  console.log("[extract] Extracting appointment request.", {
    model: EXTRACTION_MODEL,
    turns: turns.length,
  });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        input: [
          {
            role: "system",
            content:
              "Extract a salon appointment request from the call transcript only if the caller clearly asked to book, schedule, make an appointment, come in, or request a specific appointment time. Return only valid JSON. This is only a request; never mark it confirmed. If the caller only asked for information, prices, services, colors, address, or hours, or declined booking, set all appointment fields to null, summarize that no appointment was requested, and set unresolved false. Use null for unknown fields. requested_date must be YYYY-MM-DD only when an exact date is clear. If only a day or vague date is known, put that text in requested_day.",
          },
          {
            role: "user",
            content: transcriptText,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "appointment_request_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                customer_name: { type: ["string", "null"] },
                customer_phone: { type: ["string", "null"] },
                requested_service: { type: ["string", "null"] },
                requested_date: { type: ["string", "null"], description: "YYYY-MM-DD if exact date is clear." },
                requested_day: { type: ["string", "null"], description: "Text like tomorrow, Friday, next week, or May 20 if no year is clear." },
                requested_time: { type: ["string", "null"], description: "HH:MM if clear, otherwise caller wording." },
                notes: { type: ["string", "null"] },
                summary: { type: "string" },
                unresolved: { type: "boolean" },
              },
              required: [
                "customer_name",
                "customer_phone",
                "requested_service",
                "requested_date",
                "requested_day",
                "requested_time",
                "notes",
                "summary",
                "unresolved",
              ],
            },
          },
        },
      }),
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      console.error("[extract] OpenAI extraction failed.", {
        status: response.status,
        body,
      });
      return fallback;
    }

    const text = readResponseText(body);
    if (!text) {
      console.warn("[extract] OpenAI extraction response did not include output text.", body);
      return fallback;
    }

    const parsed = JSON.parse(text) as AppointmentRequestExtraction;
    console.log("[extract] Appointment request extracted.", parsed);
    return normalizeExtraction(parsed, fallback);
  } catch (error) {
    console.error("[extract] Appointment extraction error:", error);
    return fallback;
  }
}

function hasExplicitBookingIntent(turns: TranscriptTurn[]) {
  const customerText = turns
    .filter((turn) => turn.role === "customer")
    .map((turn) => turn.text.toLowerCase())
    .join(" ");

  if (!customerText.trim()) {
    return false;
  }

  if (/\b(no thanks|no thank you|not now|just asking|only asking|just checking|i'm good|im good)\b/.test(customerText)) {
    return false;
  }

  return /\b(book|booking|appointment|schedule|reserve|come in|come by|set up|make an appointment|available (today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|can i get|i want to get|i'd like to get|id like to get)\b/.test(customerText);
}

function readResponseText(body: Record<string, unknown>) {
  if (typeof body.output_text === "string") {
    return body.output_text;
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
      if (typeof text === "string") {
        return text;
      }
    }
  }

  return null;
}

function normalizeExtraction(
  extraction: AppointmentRequestExtraction,
  fallback: AppointmentRequestExtraction,
): AppointmentRequestExtraction {
  return {
    customer_name: cleanNullable(extraction.customer_name),
    customer_phone: cleanNullable(extraction.customer_phone),
    requested_service: cleanNullable(extraction.requested_service),
    requested_date: normalizeDate(extraction.requested_date),
    requested_day: cleanNullable(extraction.requested_day),
    requested_time: cleanNullable(extraction.requested_time),
    notes: cleanNullable(extraction.notes),
    summary: cleanNullable(extraction.summary) ?? fallback.summary,
    unresolved: Boolean(extraction.unresolved),
  };
}

function buildFallbackExtraction(turns: TranscriptTurn[]): AppointmentRequestExtraction {
  const customerTurns = turns.filter((turn) => turn.role === "customer").map((turn) => turn.text);
  const summary =
    customerTurns.length > 0
      ? `Caller discussed an appointment request: ${customerTurns.join(" ")}`
      : "Call ended before appointment details were captured.";

  return {
    customer_name: null,
    customer_phone: null,
    requested_service: null,
    requested_date: null,
    requested_day: null,
    requested_time: null,
    notes: customerTurns.join(" ") || null,
    summary,
    unresolved: true,
  };
}

function cleanNullable(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDate(value: unknown) {
  const cleaned = cleanNullable(value);
  if (!cleaned) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : null;
}
