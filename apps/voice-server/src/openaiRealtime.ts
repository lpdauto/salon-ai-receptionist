import WebSocket from "ws";

// Server-to-server Realtime websocket endpoint.
// gpt-realtime is the current GA realtime speech-to-speech model.
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`;
const MAX_QUEUED_AUDIO_CHUNKS = 250;

type RealtimeEvent = {
  type?: string;
  event_id?: string;
  delta?: unknown;
  error?: unknown;
  session?: unknown;
  response?: unknown;
  [key: string]: unknown;
};

export type OpenAIRealtimeHandlers = {
  onAudioDelta: (audioBase64: string) => void;
  onReady?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
};

export class OpenAIRealtimeConnection {
  private ws?: WebSocket;
  private isSocketOpen = false;
  private isSessionReady = false;
  private hasConnectionFailed = false;
  private didSendGreeting = false;
  private pendingAudio: string[] = [];
  private connectionTimeout?: NodeJS.Timeout;

  constructor(
    private readonly apiKey: string,
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
        modalities: ["audio", "text"],
        instructions:
          "Greet the caller warmly in one short sentence as a salon AI receptionist, then ask how you can help.",
      },
    });
  }

  close() {
    console.log("[openai] Closing Realtime websocket.", {
      socketOpen: this.isSocketOpen,
      sessionReady: this.isSessionReady,
      queuedAudioChunks: this.pendingAudio.length,
    });

    this.isSocketOpen = false;
    this.isSessionReady = false;
    this.hasConnectionFailed = false;
    this.pendingAudio = [];
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
        instructions:
          "You are a concise, friendly AI receptionist for a salon. Keep replies brief and natural for a phone call.",
        audio: {
          input: {
            format: {
              type: "audio/pcmu",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: true,
              interrupt_response: false,
            },
          },
          output: {
            format: {
              type: "audio/pcmu",
            },
            voice: "marin",
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

    if (eventType.startsWith("response.")) {
      console.log("[openai] Response event.", {
        type: eventType,
        response: this.summarizeResponse(event.response),
      });
    }

    if (eventType === "response.audio.delta" || eventType === "response.output_audio.delta") {
      // The model streams generated speech as base64 audio deltas. Because
      // output format is audio/pcmu, so these can be sent to Twilio directly.
      const delta = event.delta;
      if (typeof delta === "string") {
        this.handlers.onAudioDelta(delta);
      } else {
        console.warn("[openai] Audio delta event did not include a string delta.");
      }
      return;
    }

    if (eventType === "response.audio.done" || eventType === "response.output_audio.done") {
      console.log("[openai] Output audio response completed.");
      return;
    }

    if (eventType === "input_audio_buffer.speech_started") {
      console.log("[openai] Caller speech detected.");
      return;
    }

    if (eventType === "input_audio_buffer.speech_stopped") {
      console.log("[openai] Caller speech stopped.");
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

  private clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }
  }

  private sendJson(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[openai] Tried to send while websocket was not open.", {
        type: payload.type,
        readyState: this.ws?.readyState,
      });
      return;
    }

    console.log("[openai] Sending event:", payload.type);
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
