import WebSocket from "ws";
import { OpenAIRealtimeConnection } from "./openaiRealtime";

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

export function handleTwilioMediaStream(twilioWs: WebSocket, openAIApiKey: string) {
  let streamSid: string | undefined;
  let callSid: string | undefined;
  let mediaEventCount = 0;
  let droppedMediaBeforeReady = 0;
  let didPauseTwilioInput = false;
  let pauseTimeout: NodeJS.Timeout | undefined;

  console.log("[twilio] Media Stream websocket connected.");

  const openai = new OpenAIRealtimeConnection(openAIApiKey, {
    onReady: () => {
      console.log("[twilio] OpenAI Realtime session is ready for this Twilio stream.", {
        streamSid,
        callSid,
        droppedMediaBeforeReady,
      });

      resumeTwilioInput();

      if (streamSid) {
        openai.sendInitialGreeting();
      }
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
    onClose: () => {
      console.log("[twilio] OpenAI connection closed for Twilio stream.", {
        streamSid,
        callSid,
      });
    },
    onError: (error) => {
      console.error("[twilio] OpenAI connection error for Twilio stream:", error);
    },
  });

  pauseTwilioInput("initial OpenAI connection setup");
  openai.connect();
  setTimeout(() => {
    resumeTwilioInput();
  }, 1_000);

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
        console.log("[twilio] Start event.", {
          streamSid,
          callSid,
          tracks: startEvent.start.tracks,
          mediaFormat: startEvent.start.mediaFormat,
          customParameters: startEvent.start.customParameters,
        });
        openai.sendInitialGreeting();
        pauseTwilioInputUntilOpenAIReady();
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
        if (openai.isReady()) {
          openai.sendAudio(mediaEvent.media.payload);
        } else {
          droppedMediaBeforeReady += 1;
          if (droppedMediaBeforeReady === 1 || droppedMediaBeforeReady % 100 === 0) {
            console.log("[twilio] Dropping inbound media until OpenAI session is ready.", {
              streamSid,
              callSid,
              droppedMediaBeforeReady,
              openAIStatus: openai.getStatus(),
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
        clearPauseTimeout();
        openai.close();
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
    clearPauseTimeout();
    openai.close();
  });

  twilioWs.on("error", (error) => {
    console.error("[twilio] Media Stream websocket error:", error);
    clearPauseTimeout();
    openai.close();
  });

  function pauseTwilioInputUntilOpenAIReady() {
    if (openai.isReady() || didPauseTwilioInput) {
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
      openAIStatus: openai.getStatus(),
    });

    twilioWs.pause();

    pauseTimeout = setTimeout(() => {
      console.warn("[twilio] Pause timeout reached; resuming Twilio input.", {
        reason,
        streamSid,
        callSid,
        openAIStatus: openai.getStatus(),
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
      openAIStatus: openai.getStatus(),
    });
  }

  function clearPauseTimeout() {
    if (pauseTimeout) {
      clearTimeout(pauseTimeout);
      pauseTimeout = undefined;
    }
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
