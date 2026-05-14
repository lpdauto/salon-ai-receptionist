export type TranscriptTurn = {
  role: "customer" | "assistant";
  text: string;
};

export type AppointmentRequestExtraction = {
  appointment_intent_detected: boolean;
  customer_name: string | null;
  customer_phone: string | null;
  requested_service: string | null;
  requested_date: string | null;
  requested_datetime_text: string | null;
  requested_day: string | null;
  requested_time: string | null;
  missing_fields: string[];
  needs_review: boolean;
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
      appointment_intent_detected: false,
      customer_name: null,
      customer_phone: null,
      requested_service: null,
      requested_date: null,
      requested_datetime_text: null,
      requested_day: null,
      requested_time: null,
      missing_fields: [],
      needs_review: false,
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
              "Extract a salon appointment request from the call transcript only if the caller clearly asked to book, schedule, make an appointment, come in, asked whether they can come at a day/time, asked if there is time available, or provided service plus date/time intent. Return only valid JSON. This is only a request; never mark it confirmed. The operator must approve the request before the caller receives an SMS text confirmation. If the caller only asked for information, prices, services, colors, address, hours, or declined booking, appointment_intent_detected must be false, all appointment fields must be null, missing_fields must be empty, summarize that no appointment was requested, needs_review false, and unresolved false. Use null for unknown fields. requested_date must be YYYY-MM-DD only when an exact date is clear. requested_time must be HH:MM only when exact time is clear. If date/time is vague, such as Saturday afternoon or tomorrow morning, put the caller wording in requested_datetime_text.",
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
                appointment_intent_detected: { type: "boolean" },
                customer_name: { type: ["string", "null"] },
                customer_phone: { type: ["string", "null"] },
                requested_service: { type: ["string", "null"] },
                requested_date: { type: ["string", "null"], description: "YYYY-MM-DD if exact date is clear." },
                requested_datetime_text: { type: ["string", "null"], description: "Caller wording for uncertain or partial date/time, such as Saturday afternoon." },
                requested_day: { type: ["string", "null"], description: "Text like tomorrow, Friday, next week, or May 20 if no year is clear." },
                requested_time: { type: ["string", "null"], description: "HH:MM only if exact time is clear." },
                missing_fields: {
                  type: "array",
                  items: { type: "string", enum: ["customer_name", "customer_phone", "requested_service", "requested_datetime"] },
                },
                needs_review: { type: "boolean" },
                notes: { type: ["string", "null"] },
                summary: { type: "string" },
                unresolved: { type: "boolean" },
              },
              required: [
                "appointment_intent_detected",
                "customer_name",
                "customer_phone",
                "requested_service",
                "requested_date",
                "requested_datetime_text",
                "requested_day",
                "requested_time",
                "missing_fields",
                "needs_review",
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

  return /\b(book|booking|appointment|schedule|reserve|come in|come by|set up|make an appointment|do you have time|any time|available (today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|can i come|can i get .* (today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s*(am|pm)?)|i want .* appointment|i'd like .* appointment|id like .* appointment)\b/.test(customerText);
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
  const customerName = cleanNullable(extraction.customer_name);
  const customerPhone = cleanNullable(extraction.customer_phone);
  const requestedService = cleanNullable(extraction.requested_service);
  const requestedDate = normalizeDate(extraction.requested_date);
  const requestedDatetimeText = cleanNullable(extraction.requested_datetime_text);
  const requestedDay = cleanNullable(extraction.requested_day);
  const requestedTime = cleanNullable(extraction.requested_time);
  const appointmentIntentDetected = Boolean(extraction.appointment_intent_detected);
  const missingFields = appointmentIntentDetected
    ? buildMissingFields({
        customerName,
        customerPhone,
        requestedService,
        requestedDate,
        requestedDay,
        requestedDatetimeText,
        requestedTime,
      })
    : [];
  const needsReview = appointmentIntentDetected && (missingFields.length > 0 || Boolean(extraction.needs_review));

  return {
    appointment_intent_detected: appointmentIntentDetected,
    customer_name: customerName,
    customer_phone: customerPhone,
    requested_service: requestedService,
    requested_date: requestedDate,
    requested_datetime_text: requestedDatetimeText,
    requested_day: requestedDay,
    requested_time: requestedTime,
    missing_fields: missingFields,
    needs_review: needsReview,
    notes: cleanNullable(extraction.notes),
    summary: cleanNullable(extraction.summary) ?? fallback.summary,
    unresolved: Boolean(extraction.unresolved || needsReview),
  };
}

function buildFallbackExtraction(turns: TranscriptTurn[]): AppointmentRequestExtraction {
  const customerTurns = turns.filter((turn) => turn.role === "customer").map((turn) => turn.text);
  const summary =
    customerTurns.length > 0
      ? `Caller discussed an appointment request: ${customerTurns.join(" ")}`
      : "Call ended before appointment details were captured.";

  return {
    appointment_intent_detected: hasExplicitBookingIntent(turns),
    customer_name: null,
    customer_phone: null,
    requested_service: null,
    requested_date: null,
    requested_datetime_text: null,
    requested_day: null,
    requested_time: null,
    missing_fields: ["customer_name", "customer_phone", "requested_service", "requested_datetime"],
    needs_review: true,
    notes: customerTurns.join(" ") || null,
    summary,
    unresolved: true,
  };
}

function buildMissingFields(input: {
  customerName: string | null;
  customerPhone: string | null;
  requestedService: string | null;
  requestedDate: string | null;
  requestedDay: string | null;
  requestedDatetimeText: string | null;
  requestedTime: string | null;
}) {
  const missing: string[] = [];
  if (!input.customerName) missing.push("customer_name");
  if (!input.customerPhone) missing.push("customer_phone");
  if (!input.requestedService) missing.push("requested_service");
  const hasDateOrDay = Boolean(input.requestedDate || input.requestedDay || input.requestedDatetimeText);
  const hasTimeOrWindow = Boolean(input.requestedTime || input.requestedDatetimeText);
  if (!hasDateOrDay || !hasTimeOrWindow) missing.push("requested_datetime");
  return missing;
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
