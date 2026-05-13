import WebSocket from "ws";

// Server-to-server Realtime websocket endpoint.
// gpt-realtime is the current GA realtime speech-to-speech model.
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`;
const OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";
const MAX_QUEUED_AUDIO_CHUNKS = 250;
const SPEECH_END_GRACE_MS = Number(process.env.SPEECH_END_GRACE_MS ?? 380);
const MAX_DEAD_AIR_MS = Number(process.env.MAX_DEAD_AIR_MS ?? 1_500);
const LATENCY_FILLER_AFTER_MS = Number(process.env.LATENCY_FILLER_AFTER_MS ?? 1_200);

type RealtimeEvent = {
  type?: string;
  event_id?: string;
  delta?: unknown;
  transcript?: unknown;
  error?: unknown;
  session?: unknown;
  response?: unknown;
  item_id?: unknown;
  item?: unknown;
  part?: unknown;
  [key: string]: unknown;
};

export type OpenAIRealtimeHandlers = {
  onAudioDelta: (audioBase64: string) => void;
  onCallerInterruption?: () => void;
  onTranscriptTurn?: (role: "customer" | "assistant", text: string, isActionable: boolean) => void;
  onReady?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
};

export type OpenAIRealtimeOptions = {
  sessionInstructions: string;
  initialGreetingInstructions: string;
  turnResponseInstructions: string | ((customerText: string) => string);
};

export class OpenAIRealtimeConnection {
  private ws?: WebSocket;
  private isSocketOpen = false;
  private isSessionReady = false;
  private hasConnectionFailed = false;
  private didSendGreeting = false;
  private pendingAudio: string[] = [];
  private connectionTimeout?: NodeJS.Timeout;
  private customerTranscriptByItemId = new Map<string, string>();
  private assistantTranscriptByItemId = new Map<string, string>();
  private emittedTranscriptTurns = new Set<string>();
  private currentSpeechStartedAt = 0;
  private currentSpeechStoppedAt = 0;
  private lastResponseRequestedAt = 0;
  private lastAssistantAudioDoneAt = 0;
  private pendingCustomerText?: string;
  private pendingCustomerTranscriptAt = 0;
  private responseGraceTimer?: NodeJS.Timeout;
  private responseLatencyTimer?: NodeJS.Timeout;
  private currentResponseRequestedAt = 0;
  private currentResponseFirstAudioAt = 0;
  private currentTurnStartedAt = 0;
  private didTriggerFillerForCurrentTurn = false;
  private assistantAudioStarted = false;
  private responseInProgress = false;
  private turnStats = {
    customerTurns: 0,
    assistantTurns: 0,
    interruptions: 0,
    fillers: 0,
    responseLatencies: [] as number[],
  };

  constructor(
    private readonly apiKey: string,
    private readonly options: OpenAIRealtimeOptions,
    private readonly handlers: OpenAIRealtimeHandlers,
  ) {}

  connect() {
    if (this.ws) {
      console.warn("[openai] connect() called but websocket already exists.");
      return;
    }

    console.log("[openai] Connecting to Realtime API websocket.", {
      url: OPENAI_REALTIME_URL,
      model: OPENAI_REALTIME_MODEL,
      hasApiKey: Boolean(this.apiKey),
      headers: ["Authorization"],
    });

    this.ws = new WebSocket(OPENAI_REALTIME_URL, {
      handshakeTimeout: 10_000,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    this.connectionTimeout = setTimeout(() => {
      if (!this.isSocketOpen) {
        console.error("[openai] Websocket did not open within 10 seconds.", {
          readyState: this.ws?.readyState,
          model: OPENAI_REALTIME_MODEL,
        });
        this.hasConnectionFailed = true;
        this.ws?.terminate();
      }
    }, 10_000);

    this.ws.on("open", () => {
      this.clearConnectionTimeout();
      this.isSocketOpen = true;
      this.hasConnectionFailed = false;
      console.log("[openai] Websocket open. Sending session.update next.");
      this.configureSession();
    });

    this.ws.on("unexpected-response", (_request, response) => {
      this.hasConnectionFailed = true;

      const chunks: Buffer[] = [];
      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        console.error("[openai] Websocket handshake rejected.", {
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: {
            "content-type": response.headers["content-type"],
            "www-authenticate": response.headers["www-authenticate"],
            "openai-processing-ms": response.headers["openai-processing-ms"],
            "x-request-id": response.headers["x-request-id"],
          },
          body,
        });
      });
    });

    this.ws.on("message", (rawMessage) => {
      this.handleMessage(rawMessage.toString());
    });

    this.ws.on("close", (code, reason) => {
      this.clearConnectionTimeout();
      console.log("[openai] Websocket closed.", {
        code,
        reason: reason.toString() || "(no reason)",
        wasSessionReady: this.isSessionReady,
        connectionFailed: this.hasConnectionFailed,
        queuedAudioChunks: this.pendingAudio.length,
      });
      this.isSocketOpen = false;
      this.isSessionReady = false;
      this.handlers.onClose?.();
    });

    this.ws.on("error", (error) => {
      this.hasConnectionFailed = true;
      this.clearConnectionTimeout();
      console.error("[openai] Websocket error:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
      this.handlers.onError?.(error);
    });
  }

  sendAudio(audioBase64: string) {
    if (!audioBase64) {
      return;
    }

    if (!this.isReady()) {
      if (this.pendingAudio.length >= MAX_QUEUED_AUDIO_CHUNKS) {
        this.pendingAudio.shift();
      }

      this.pendingAudio.push(audioBase64);

      if (this.pendingAudio.length === 1 || this.pendingAudio.length % 50 === 0) {
        console.log("[openai] Realtime session not ready yet; queueing Twilio audio chunk.", {
          socketOpen: this.isSocketOpen,
          sessionReady: this.isSessionReady,
          connectionFailed: this.hasConnectionFailed,
          queuedAudioChunks: this.pendingAudio.length,
          maxQueuedAudioChunks: MAX_QUEUED_AUDIO_CHUNKS,
          bytesBase64: audioBase64.length,
        });
      }
      return;
    }

    this.appendInputAudio(audioBase64);
  }

  getStatus() {
    return {
      socketOpen: this.isSocketOpen,
      sessionReady: this.isSessionReady,
      connectionFailed: this.hasConnectionFailed,
      queuedAudioChunks: this.pendingAudio.length,
      readyState: this.ws?.readyState,
    };
  }

  isReady() {
    return this.isSocketOpen && this.isSessionReady && this.ws?.readyState === WebSocket.OPEN;
  }

  sendInitialGreeting() {
    if (this.didSendGreeting) {
      return;
    }

    if (!this.isReady()) {
      console.log("[openai] Greeting requested before session was ready; it will be sent after session.updated.");
      return;
    }

    this.didSendGreeting = true;
    console.log("[openai] Sending initial response.create greeting.");

    this.sendJson({
      // response.create asks the model to speak first so the caller hears audio
      // without waiting for server VAD to decide the caller has finished talking.
      type: "response.create",
      response: {
        instructions: this.options.initialGreetingInstructions,
      },
    });
  }

  close() {
    console.log("[openai] Closing Realtime websocket.", {
      socketOpen: this.isSocketOpen,
      sessionReady: this.isSessionReady,
      queuedAudioChunks: this.pendingAudio.length,
      timingSummary: this.getTimingSummary(),
    });

    this.isSocketOpen = false;
    this.isSessionReady = false;
    this.hasConnectionFailed = false;
    this.pendingAudio = [];
    this.clearResponseGraceTimer();
    this.clearResponseLatencyTimer();
    this.clearConnectionTimeout();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  private configureSession() {
    console.log("[openai] Sending session.update.", {
      input_audio_format: "audio/pcmu",
      output_audio_format: "audio/pcmu",
      turn_detection: "server_vad",
    });

    this.sendJson({
      // session.update configures the speech-to-speech session before caller
      // audio is flushed. Twilio Media Streams send 8 kHz G.711 mu-law audio,
      // which maps to audio/pcmu in the current Realtime websocket interface.
      type: "session.update",
      session: {
        type: "realtime",
        instructions: this.options.sessionInstructions,
        audio: {
          input: {
            format: {
              type: "audio/pcmu",
            },
            transcription: {
              model: "gpt-4o-mini-transcribe",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 200,
              silence_duration_ms: 300,
              create_response: false,
              interrupt_response: false,
            },
          },
          output: {
            format: {
              type: "audio/pcmu",
            },
            voice: OPENAI_REALTIME_VOICE,
          },
        },
      },
    });
  }

  private handleMessage(message: string) {
    const event = this.parseEvent(message);
    if (!event) {
      return;
    }

    const eventType = String(event.type ?? "unknown");
    console.log("[openai] Event received:", {
      type: eventType,
      event_id: event.event_id,
    });

    if (eventType === "error") {
      console.error("[openai] Realtime error event:", JSON.stringify(event.error ?? event, null, 2));
      return;
    }

    if (eventType === "session.created") {
      // session.created is the server's first confirmation that the websocket
      // session exists. We still wait for session.updated before sending audio.
      console.log("[openai] Session created.", this.summarizeSession(event.session));
      return;
    }

    if (eventType === "session.updated") {
      // session.updated confirms OpenAI accepted our audio/pcmu settings.
      this.isSessionReady = true;
      console.log("[openai] Session updated and ready.", this.summarizeSession(event.session));
      this.handlers.onReady?.();
      this.sendInitialGreeting();
      this.flushPendingAudio();
      return;
    }

    if (eventType === "conversation.item.input_audio_transcription.delta") {
      // Customer speech transcription arrives separately from the audio-native
      // model response. Deltas are accumulated by item_id until completed.
      this.appendTranscriptDelta("customer", event);
      return;
    }

    if (
      eventType === "conversation.item.input_audio_transcription.completed" ||
      eventType === "conversation.item.input_audio_transcription.done"
    ) {
      this.completeTranscriptTurn("customer", event);
      return;
    }

    if (eventType === "conversation.item.input_audio_transcription.failed") {
      console.warn("[openai] Customer transcription failed.", JSON.stringify(event, null, 2));
      return;
    }

    if (eventType.startsWith("response.")) {
      console.log("[openai] Response event.", {
        type: eventType,
        response: this.summarizeResponse(event.response),
      });
    }

    if (eventType === "response.created") {
      this.responseInProgress = true;
      console.log("[turn] Assistant response started.", {
        responseLatencyMs: this.currentResponseRequestedAt ? Date.now() - this.currentResponseRequestedAt : undefined,
      });
    }

    if (
      eventType === "response.audio_transcript.delta" ||
      eventType === "response.output_audio_transcript.delta"
    ) {
      // Assistant audio responses can include a text transcript in parallel
      // with generated audio. Accumulate deltas by item_id until done.
      this.appendTranscriptDelta("assistant", event);
      return;
    }

    if (
      eventType === "response.audio_transcript.done" ||
      eventType === "response.output_audio_transcript.done"
    ) {
      this.completeTranscriptTurn("assistant", event);
      return;
    }

    if (eventType === "response.content_part.done") {
      this.captureAssistantContentPart(event);
      return;
    }

    if (eventType === "response.output_item.done") {
      this.captureAssistantOutputItem(event);
      return;
    }

    if (eventType === "response.audio.delta" || eventType === "response.output_audio.delta") {
      // The model streams generated speech as base64 audio deltas. Because
      // output format is audio/pcmu, so these can be sent to Twilio directly.
      const delta = event.delta;
      if (typeof delta === "string") {
        this.markAssistantAudioStarted();
        this.handlers.onAudioDelta(delta);
      } else {
        console.warn("[openai] Audio delta event did not include a string delta.");
      }
      return;
    }

    if (eventType === "response.audio.done" || eventType === "response.output_audio.done") {
      console.log("[openai] Output audio response completed.");
      this.lastAssistantAudioDoneAt = Date.now();
      console.log("[turn] Assistant audio stopped.", {
        responseDurationMs: this.currentResponseRequestedAt ? Date.now() - this.currentResponseRequestedAt : undefined,
      });
      return;
    }

    if (eventType === "response.done") {
      this.responseInProgress = false;
      this.assistantAudioStarted = false;
      this.clearResponseLatencyTimer();
      return;
    }

    if (eventType === "input_audio_buffer.speech_started") {
      this.currentSpeechStartedAt = Date.now();
      this.currentSpeechStoppedAt = 0;
      console.log("[turn] Customer speech started.");
      this.handleCallerSpeechStarted();
      return;
    }

    if (eventType === "input_audio_buffer.speech_stopped") {
      this.currentSpeechStoppedAt = Date.now();
      console.log("[turn] Customer speech ended.", {
        speechDurationMs: this.currentSpeechStartedAt ? this.currentSpeechStoppedAt - this.currentSpeechStartedAt : undefined,
      });
      return;
    }

    if (eventType === "input_audio_buffer.committed") {
      console.log("[openai] Caller audio committed by server VAD.");
      return;
    }
  }

  private appendInputAudio(audioBase64: string) {
    this.sendJson({
      // Twilio media.payload is already base64 G.711 mu-law audio.
      type: "input_audio_buffer.append",
      audio: audioBase64,
    });
  }

  private flushPendingAudio() {
    if (this.pendingAudio.length === 0) {
      console.log("[openai] No queued Twilio audio to flush.");
      return;
    }

    console.log("[openai] Flushing queued Twilio audio.", {
      chunks: this.pendingAudio.length,
    });

    const chunks = [...this.pendingAudio];
    this.pendingAudio = [];
    chunks.forEach((audioBase64) => this.appendInputAudio(audioBase64));
  }

  private appendTranscriptDelta(role: "customer" | "assistant", event: RealtimeEvent) {
    const itemId = this.getItemId(event);
    const delta = typeof event.delta === "string" ? event.delta : "";

    if (!itemId || !delta) {
      return;
    }

    const store = role === "customer" ? this.customerTranscriptByItemId : this.assistantTranscriptByItemId;
    store.set(itemId, `${store.get(itemId) ?? ""}${delta}`);
  }

  private completeTranscriptTurn(role: "customer" | "assistant", event: RealtimeEvent) {
    const itemId = this.getItemId(event);
    const completedTranscript = typeof event.transcript === "string" ? event.transcript : undefined;
    const store = role === "customer" ? this.customerTranscriptByItemId : this.assistantTranscriptByItemId;
    const text = (completedTranscript ?? (itemId ? store.get(itemId) : undefined) ?? "").trim();

    if (!text) {
      return;
    }

    if (itemId) {
      store.delete(itemId);
    }

    const isActionable = role === "assistant" || this.isActionableCustomerTranscript(text);
    this.emitTranscriptTurn(role, text, isActionable);

    if (role === "customer" && isActionable) {
      this.scheduleAssistantResponse(text);
    }
  }

  private scheduleAssistantResponse(customerText: string) {
    this.pendingCustomerText = customerText;
    this.pendingCustomerTranscriptAt = Date.now();
    this.currentTurnStartedAt = this.currentSpeechStartedAt || this.pendingCustomerTranscriptAt;
    this.didTriggerFillerForCurrentTurn = false;
    this.turnStats.customerTurns += 1;

    const sinceSpeechStoppedMs = this.currentSpeechStoppedAt ? Date.now() - this.currentSpeechStoppedAt : 0;
    const graceMs = Math.max(0, Math.min(SPEECH_END_GRACE_MS, MAX_DEAD_AIR_MS - sinceSpeechStoppedMs));

    this.clearResponseGraceTimer();
    console.log("[turn] Grace timer started.", {
      graceMs,
      sinceSpeechStoppedMs,
      maxDeadAirMs: MAX_DEAD_AIR_MS,
      customerText,
    });

    this.responseGraceTimer = setTimeout(() => {
      this.responseGraceTimer = undefined;
      if (!this.pendingCustomerText) {
        return;
      }

      this.requestAssistantResponse("grace timer elapsed", this.pendingCustomerText);
      this.pendingCustomerText = undefined;
    }, graceMs);
  }

  private requestAssistantResponse(reason: string, customerText?: string) {
    if (this.responseInProgress) {
      console.log("[openai] Skipping response request because one is already in progress.", {
        reason,
      });
      return;
    }

    if (customerText && !this.isActionableCustomerTranscript(customerText)) {
      console.log("[openai] Ignoring non-actionable customer transcript.", {
        text: customerText,
      });
      return;
    }

    if (Date.now() - this.lastResponseRequestedAt < 900) {
      console.log("[openai] Skipping duplicate response request.", {
        reason,
      });
      return;
    }

    this.lastResponseRequestedAt = Date.now();
    this.currentResponseRequestedAt = this.lastResponseRequestedAt;
    this.currentResponseFirstAudioAt = 0;
    this.assistantAudioStarted = false;
    console.log("[turn] AI response triggered.", {
      reason,
      responseLatencyFromSpeechEndMs: this.currentSpeechStoppedAt ? Date.now() - this.currentSpeechStoppedAt : undefined,
      responseLatencyFromTranscriptMs: this.pendingCustomerTranscriptAt ? Date.now() - this.pendingCustomerTranscriptAt : undefined,
    });
    this.startResponseLatencyTimer(customerText);

    this.sendJson({
      type: "response.create",
      response: {
        instructions: this.getTurnResponseInstructions(customerText),
      },
    });
  }

  private handleCallerSpeechStarted() {
    const assistantWasTalking = this.responseInProgress || this.assistantAudioStarted;

    if (this.pendingCustomerText) {
      console.log("[turn] Caller resumed during grace period; delaying assistant response.", {
        pendingCustomerText: this.pendingCustomerText,
      });
      this.pendingCustomerText = undefined;
      this.clearResponseGraceTimer();
    }

    if (!assistantWasTalking) {
      return;
    }

    this.turnStats.interruptions += 1;
    console.log("[turn] Caller interruption detected.", {
      responseInProgress: this.responseInProgress,
      assistantAudioStarted: this.assistantAudioStarted,
    });

    this.cancelAssistantResponse("caller interruption");
    this.handlers.onCallerInterruption?.();
  }

  private cancelAssistantResponse(reason: string) {
    if (!this.isReady()) {
      return;
    }

    console.log("[openai] Canceling assistant response.", { reason });
    this.clearResponseLatencyTimer();
    this.responseInProgress = false;
    this.assistantAudioStarted = false;

    this.sendJson({
      type: "response.cancel",
    });
  }

  private startResponseLatencyTimer(customerText?: string) {
    this.clearResponseLatencyTimer();

    this.responseLatencyTimer = setTimeout(() => {
      if (this.currentResponseFirstAudioAt || this.didTriggerFillerForCurrentTurn) {
        return;
      }

      this.didTriggerFillerForCurrentTurn = true;
      this.turnStats.fillers += 1;
      console.log("[turn] Filler triggered.", {
        afterMs: LATENCY_FILLER_AFTER_MS,
        customerText,
        note: "Realtime response is already in progress; prompt asks model to start with a tiny filler when needed.",
      });
    }, LATENCY_FILLER_AFTER_MS);
  }

  private markAssistantAudioStarted() {
    if (this.currentResponseFirstAudioAt) {
      return;
    }

    this.currentResponseFirstAudioAt = Date.now();
    const latencyMs = this.currentResponseRequestedAt ? this.currentResponseFirstAudioAt - this.currentResponseRequestedAt : 0;
    this.turnStats.responseLatencies.push(latencyMs);
    this.turnStats.assistantTurns += 1;
    this.clearResponseLatencyTimer();

    console.log("[turn] Assistant first audio.", {
      responseAudioLatencyMs: latencyMs,
      totalTurnLatencyMs: this.currentTurnStartedAt ? this.currentResponseFirstAudioAt - this.currentTurnStartedAt : undefined,
    });
  }

  private getTurnResponseInstructions(customerText?: string) {
    if (typeof this.options.turnResponseInstructions === "function") {
      return this.options.turnResponseInstructions(customerText ?? "");
    }

    return this.options.turnResponseInstructions;
  }

  private isActionableCustomerTranscript(text: string) {
    const normalized = text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!/[a-z0-9]/.test(normalized)) {
      return false;
    }

    const ignoredEchoes = new Set([
      "thank you",
      "thank you for calling",
      "thanks",
      "how can i help you",
      "how can i help you today",
      "luxe nail studio",
      "mhm",
      "mm hmm",
      "uh huh",
      "uhhuh",
      "hmm",
      "hm",
      "okay",
      "ok",
      "yeah",
      "yep",
      "yes",
    ]);

    if (ignoredEchoes.has(normalized)) {
      return false;
    }

    const words = normalized.split(" ").filter(Boolean);
    const containsServiceSignal = /\b(acrylic|acrylics|fill|fills|manicure|manicures|pedicure|pedicures|gel|service|services|price|cost|hours|address|open|closed)\b/.test(normalized);
    const isShortAfterAssistant =
      Date.now() - this.lastAssistantAudioDoneAt < 2_500 && words.length <= 2 && !containsServiceSignal;
    if (isShortAfterAssistant) {
      return false;
    }

    if (words.length <= 1 && normalized.length < 4) {
      return false;
    }

    return true;
  }

  private captureAssistantContentPart(event: RealtimeEvent) {
    const part = event.part;
    if (!part || typeof part !== "object") {
      return;
    }

    const value = part as Record<string, unknown>;
    const text = typeof value.transcript === "string" ? value.transcript : typeof value.text === "string" ? value.text : "";

    if (text.trim()) {
      this.emitTranscriptTurn("assistant", text.trim());
    }
  }

  private captureAssistantOutputItem(event: RealtimeEvent) {
    const item = event.item;
    if (!item || typeof item !== "object") {
      return;
    }

    const value = item as Record<string, unknown>;
    if (value.role !== "assistant" || !Array.isArray(value.content)) {
      return;
    }

    const text = value.content
      .map((contentPart) => {
        if (!contentPart || typeof contentPart !== "object") {
          return "";
        }

        const part = contentPart as Record<string, unknown>;
        if (typeof part.transcript === "string") {
          return part.transcript;
        }

        if (typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join(" ")
      .trim();

    if (text) {
      this.emitTranscriptTurn("assistant", text);
    }
  }

  private emitTranscriptTurn(role: "customer" | "assistant", text: string, isActionable = true) {
    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }

    const key = `${role}:${cleanText}`;
    if (this.emittedTranscriptTurns.has(key)) {
      return;
    }

    this.emittedTranscriptTurns.add(key);
    console.log(`[transcript] ${role}${isActionable ? "" : " ignored"}: ${cleanText}`);
    this.handlers.onTranscriptTurn?.(role, cleanText, isActionable);
  }

  private getItemId(event: RealtimeEvent) {
    return typeof event.item_id === "string" ? event.item_id : "unknown";
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }
  }

  private clearResponseGraceTimer() {
    if (this.responseGraceTimer) {
      clearTimeout(this.responseGraceTimer);
      this.responseGraceTimer = undefined;
    }
  }

  private clearResponseLatencyTimer() {
    if (this.responseLatencyTimer) {
      clearTimeout(this.responseLatencyTimer);
      this.responseLatencyTimer = undefined;
    }
  }

  private getTimingSummary() {
    const latencies = this.turnStats.responseLatencies;
    const averageLatencyMs = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : undefined;

    return {
      ...this.turnStats,
      averageResponseAudioLatencyMs: averageLatencyMs,
      maxResponseAudioLatencyMs: latencies.length ? Math.max(...latencies) : undefined,
      speechEndGraceMs: SPEECH_END_GRACE_MS,
      maxDeadAirMs: MAX_DEAD_AIR_MS,
    };
  }

  private sendJson(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[openai] Tried to send while websocket was not open.", {
        type: payload.type,
        readyState: this.ws?.readyState,
      });
      return;
    }

    if (payload.type !== "input_audio_buffer.append") {
      console.log("[openai] Sending event:", payload.type);
    }
    this.ws.send(JSON.stringify(payload));
  }

  private parseEvent(message: string): RealtimeEvent | null {
    try {
      return JSON.parse(message) as RealtimeEvent;
    } catch (error) {
      console.error("[openai] Failed to parse event:", {
        message,
        error,
      });
      return null;
    }
  }

  private summarizeSession(session: unknown) {
    if (!session || typeof session !== "object") {
      return session;
    }

    const value = session as Record<string, unknown>;
    return {
      id: value.id,
      model: value.model,
      modalities: value.modalities,
      voice: value.voice,
      input_audio_format: value.input_audio_format,
      output_audio_format: value.output_audio_format,
      turn_detection: value.turn_detection,
    };
  }

  private summarizeResponse(response: unknown) {
    if (!response || typeof response !== "object") {
      return response;
    }

    const value = response as Record<string, unknown>;
    return {
      id: value.id,
      status: value.status,
      status_details: value.status_details,
      output: Array.isArray(value.output) ? `${value.output.length} item(s)` : undefined,
    };
  }
}
