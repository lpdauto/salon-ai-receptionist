import WebSocket from "ws";
import { buildControlledTurnInstructions } from "./conversationControl";
import { extractAppointmentRequest } from "./appointmentExtraction";
import { OpenAIRealtimeConnection } from "./openaiRealtime";
import {
  buildInitialGreetingInstructions,
  buildRealtimeInstructions,
  loadSalonProfile,
  SalonProfile,
} from "./salonProfile";
import { saveAppointmentRequest, saveCallTracking } from "./supabasePersistence";

type TwilioConnectedEvent = {
  event: "connected";
  protocol?: string;
  version?: string;
};

type TwilioStartEvent = {
  event: "start";
  sequenceNumber?: string;
  start: {
    streamSid: string;
    callSid: string;
    accountSid?: string;
    from?: string;
    to?: string;
    tracks?: string[];
    mediaFormat?: {
      encoding?: string;
      sampleRate?: number;
      channels?: number;
    };
    customParameters?: Record<string, string>;
  };
};

type TwilioMediaEvent = {
  event: "media";
  sequenceNumber?: string;
  media: {
    track?: string;
    chunk?: string;
    timestamp?: string;
    payload: string;
  };
};

type TwilioStopEvent = {
  event: "stop";
  sequenceNumber?: string;
  stop: {
    accountSid?: string;
    callSid: string;
  };
};

type TwilioStreamEvent =
  | TwilioConnectedEvent
  | TwilioStartEvent
  | TwilioMediaEvent
  | TwilioStopEvent
  | { event: string; [key: string]: unknown };

type TranscriptTurn = {
  role: "customer" | "assistant";
  text: string;
};

type TwilioStreamOptions = {
  openAIApiKey: string;
  businessId: string;
};

export function handleTwilioMediaStream(twilioWs: WebSocket, options: TwilioStreamOptions) {
  let streamSid: string | undefined;
  let callSid: string | undefined;
  let fromPhone: string | undefined;
  let toPhone: string | undefined;
  let startedAt: Date | undefined;
  let didPersistCall = false;
  let mediaEventCount = 0;
  let droppedMediaBeforeReady = 0;
  let didPauseTwilioInput = false;
  let pauseTimeout: NodeJS.Timeout | undefined;
  let didPrintFinalTranscript = false;
  let activeBusinessId = options.businessId;
  let salonProfile: SalonProfile | undefined;
  let openai: OpenAIRealtimeConnection | undefined;
  let didMentionRequestPolicy = false;
  const transcript: TranscriptTurn[] = [];

  console.log("[twilio] Media Stream websocket connected.");

  twilioWs.on("message", (rawMessage) => {
    const message = rawMessage.toString();
    const twilioEvent = parseTwilioEvent(message);

    if (!twilioEvent) {
      return;
    }

    switch (twilioEvent.event) {
      case "connected": {
        // Twilio sends connected first when the websocket handshake is complete.
        console.log("[twilio] Connected event.", {
          protocol: twilioEvent.protocol,
          version: twilioEvent.version,
        });
        break;
      }

      case "start": {
        const startEvent = twilioEvent as TwilioStartEvent;
        // start contains stream metadata. streamSid is required when sending audio back.
        streamSid = startEvent.start.streamSid;
        callSid = startEvent.start.callSid;
        startedAt = new Date();
        fromPhone = startEvent.start.customParameters?.from ?? startEvent.start.from;
        toPhone = startEvent.start.customParameters?.to ?? startEvent.start.to;
        console.log("[twilio] Start event.", {
          streamSid,
          callSid,
          fromPhone,
          toPhone,
          tracks: startEvent.start.tracks,
          mediaFormat: startEvent.start.mediaFormat,
          customParameters: startEvent.start.customParameters,
        });
        void startOpenAIForCall();
        break;
      }

      case "media": {
        const mediaEvent = twilioEvent as TwilioMediaEvent;
        mediaEventCount += 1;
        // media contains a base64 G.711 mu-law audio chunk from the caller.
        // Twilio sends these about every 20 ms, so log a sample instead of
        // every frame. Logging every frame can slow local websocket handling.
        if (mediaEventCount === 1 || mediaEventCount % 50 === 0) {
          console.log("[twilio] Media event sample.", {
            streamSid,
            callSid,
            mediaEventCount,
            track: mediaEvent.media.track,
            chunk: mediaEvent.media.chunk,
            timestamp: mediaEvent.media.timestamp,
            bytesBase64: mediaEvent.media.payload.length,
          });
        }
        if (openai?.isReady()) {
          openai.sendAudio(mediaEvent.media.payload);
        } else {
          droppedMediaBeforeReady += 1;
          if (droppedMediaBeforeReady === 1 || droppedMediaBeforeReady % 100 === 0) {
            console.log("[twilio] Dropping inbound media until OpenAI session is ready.", {
              streamSid,
              callSid,
              droppedMediaBeforeReady,
              openAIStatus: openai?.getStatus() ?? "not-created",
            });
          }
        }
        break;
      }

      case "stop": {
        const stopEvent = twilioEvent as TwilioStopEvent;
        // stop means Twilio has ended the stream for this call.
        console.log("[twilio] Stop event.", {
          streamSid,
          callSid: stopEvent.stop.callSid,
          mediaEventCount,
          droppedMediaBeforeReady,
        });
        void persistCallResult("completed");
        clearPauseTimeout();
        openai?.close();
        break;
      }

      default: {
        console.log("[twilio] Unhandled event payload:", JSON.stringify(twilioEvent, null, 2));
        break;
      }
    }
  });

  twilioWs.on("close", (code, reason) => {
    console.log("[twilio] Media Stream websocket closed.", {
      code,
      reason: reason.toString(),
      streamSid,
      callSid,
    });
    void persistCallResult("completed");
    clearPauseTimeout();
    openai?.close();
  });

  twilioWs.on("error", (error) => {
    console.error("[twilio] Media Stream websocket error:", error);
    clearPauseTimeout();
    openai?.close();
  });

  async function startOpenAIForCall() {
    pauseTwilioInput("loading salon profile from Supabase");

    try {
      salonProfile = await loadSalonProfile({
        toPhone,
        fallbackBusinessId: options.businessId,
      });
      activeBusinessId = salonProfile.businessId;

      console.log("[twilio] Loaded salon profile for call.", {
        streamSid,
        callSid,
        businessId: salonProfile.businessId,
        businessName: salonProfile.businessName,
        services: salonProfile.services.length,
        hours: salonProfile.businessHours.length,
        supportedLanguages: salonProfile.aiSettings.supported_languages,
      });

      openai = createOpenAIConnection(salonProfile);
      pauseTwilioInputUntilOpenAIReady();
      openai.connect();
    } catch (error) {
      console.error("[twilio] Failed to load salon profile; closing call stream.", error);
      resumeTwilioInput();
      twilioWs.close(1011, "Failed to load salon profile");
    }
  }

  function createOpenAIConnection(profile: SalonProfile) {
    return new OpenAIRealtimeConnection(
      options.openAIApiKey,
      {
        sessionInstructions: buildRealtimeInstructions(profile),
        initialGreetingInstructions: buildInitialGreetingInstructions(profile),
        turnResponseInstructions: (customerText) =>
          buildControlledTurnInstructions(profile, customerText, {
            didMentionRequestPolicy,
          }),
      },
      {
        onReady: () => {
          console.log("[twilio] OpenAI Realtime session is ready for this Twilio stream.", {
            streamSid,
            callSid,
            droppedMediaBeforeReady,
          });

          resumeTwilioInput();
        },
        onAudioDelta: (audioBase64) => {
          if (!streamSid) {
            console.warn("[twilio] Cannot send OpenAI audio yet; Twilio streamSid is not known.");
            return;
          }

          if (twilioWs.readyState !== WebSocket.OPEN) {
            console.warn("[twilio] Cannot send OpenAI audio; Twilio websocket is not open.");
            return;
          }

          console.log("[twilio] Sending OpenAI audio delta back to Twilio.", {
            streamSid,
            bytesBase64: audioBase64.length,
          });

          twilioWs.send(
            JSON.stringify({
              event: "media",
              streamSid,
              media: {
                payload: audioBase64,
              },
            }),
          );
        },
        onCallerInterruption: () => {
          if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) {
            return;
          }

          console.log("[twilio] Clearing outbound assistant audio after caller interruption.", {
            streamSid,
            callSid,
          });

          twilioWs.send(
            JSON.stringify({
              event: "clear",
              streamSid,
            }),
          );
        },
        onTranscriptTurn: (role, text, isActionable) => {
          const cleanText = text.trim();
          if (!cleanText) {
            return;
          }

          if (!isActionable) {
            console.log(`[call transcript ignored] ${role}: ${cleanText}`);
            return;
          }

          transcript.push({
            role,
            text: cleanText,
          });

          if (
            role === "assistant" &&
            cleanText.toLowerCase().includes("the salon will confirm availability")
          ) {
            didMentionRequestPolicy = true;
          }

          console.log(`[call transcript] ${role}: ${cleanText}`);
        },
        onClose: () => {
          console.log("[twilio] OpenAI connection closed for Twilio stream.", {
            streamSid,
            callSid,
          });
        },
        onError: (error) => {
          console.error("[twilio] OpenAI connection error for Twilio stream:", error);
        },
      },
    );
  }

  async function persistCallResult(status: "completed" | "failed") {
    if (didPersistCall) {
      return;
    }

    didPersistCall = true;

    const endedAt = new Date();
    console.log("[call] Persisting call result.", {
      streamSid,
      callSid,
      fromPhone,
      toPhone,
      transcriptTurns: transcript.length,
    });

    const extraction = await extractAppointmentRequest(options.openAIApiKey, transcript);
    const callId = await saveCallTracking({
      businessId: activeBusinessId,
      twilioCallSid: callSid,
      fromPhone,
      toPhone,
      status,
      startedAt,
      endedAt,
      unresolved: extraction.unresolved,
      summary: extraction.summary,
    });

    await saveAppointmentRequest({
      businessId: activeBusinessId,
      callId,
      extraction,
      fallbackCustomerPhone: fromPhone,
    });

    printFinalSummary(extraction.summary);
  }

  function pauseTwilioInputUntilOpenAIReady() {
    if (openai?.isReady() || didPauseTwilioInput) {
      return;
    }

    pauseTwilioInput("waiting for OpenAI session.updated");
  }

  function pauseTwilioInput(reason: string) {
    if (didPauseTwilioInput || twilioWs.readyState !== WebSocket.OPEN) {
      return;
    }

    didPauseTwilioInput = true;
    console.log("[twilio] Pausing inbound Twilio socket.", {
      reason,
      streamSid,
      callSid,
      openAIStatus: openai?.getStatus() ?? "not-created",
    });

    twilioWs.pause();

    pauseTimeout = setTimeout(() => {
      console.warn("[twilio] Pause timeout reached; resuming Twilio input.", {
        reason,
        streamSid,
        callSid,
        openAIStatus: openai?.getStatus() ?? "not-created",
      });
      resumeTwilioInput();
    }, 8_000);
  }

  function resumeTwilioInput() {
    if (!didPauseTwilioInput) {
      return;
    }

    clearPauseTimeout();
    didPauseTwilioInput = false;
    twilioWs.resume();

    console.log("[twilio] Resumed inbound Twilio socket.", {
      streamSid,
      callSid,
      openAIStatus: openai?.getStatus() ?? "not-created",
    });
  }

  function clearPauseTimeout() {
    if (pauseTimeout) {
      clearTimeout(pauseTimeout);
      pauseTimeout = undefined;
    }
  }

  function printFinalSummary(summary: string) {
    if (didPrintFinalTranscript) {
      return;
    }

    didPrintFinalTranscript = true;

    console.log("[call] Final summary.", {
      streamSid,
      callSid,
      turns: transcript.length,
      summary,
      mediaEventCount,
      droppedMediaBeforeReady,
    });
  }
}

function parseTwilioEvent(message: string): TwilioStreamEvent | null {
  try {
    return JSON.parse(message) as TwilioStreamEvent;
  } catch (error) {
    console.error("[twilio] Failed to parse websocket message:", message, error);
    return null;
  }
}
