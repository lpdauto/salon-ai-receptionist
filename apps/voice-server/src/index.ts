import "dotenv/config";
import express from "express";
import http from "http";
import WebSocket from "ws";
import { WebSocketServer } from "ws";
import { loadSalonProfile } from "./salonProfile";
import { handleTwilioMediaStream } from "./twilioStream";

const openAIRealtimeModel = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";

const port = Number(process.env.PORT ?? 3001);
const openAIApiKey = process.env.OPENAI_API_KEY;
const defaultBusinessId = process.env.DEFAULT_BUSINESS_ID;

if (!openAIApiKey) {
  throw new Error("OPENAI_API_KEY is required. Add it to apps/voice-server/.env.");
}

if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required. Add it to apps/voice-server/.env.");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required. Add it to apps/voice-server/.env.");
}

if (!defaultBusinessId) {
  throw new Error("DEFAULT_BUSINESS_ID is required. Add it to apps/voice-server/.env.");
}

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "voice-server",
  });
});

app.post("/twilio/voice", (req, res) => {
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const publicBaseUrl = process.env.PUBLIC_VOICE_SERVER_URL?.trim();
  const baseUrl = publicBaseUrl || `${proto}://${host}`;
  const streamUrl = baseUrl.replace(/^http/i, "ws").replace(/\/$/, "") + "/media-stream";

  const from = String(req.body.From ?? "");
  const to = String(req.body.To ?? "");
  const callSid = String(req.body.CallSid ?? "");

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="from" value="${escapeXml(from)}" />
      <Parameter name="to" value="${escapeXml(to)}" />
      <Parameter name="callSid" value="${escapeXml(callSid)}" />
    </Stream>
  </Connect>
</Response>`);
});

app.get("/debug/openai-realtime", (_req, res) => {
  const url = `wss://api.openai.com/v1/realtime?model=${openAIRealtimeModel}`;
  const startedAt = Date.now();

  console.log("[debug] Testing OpenAI Realtime websocket.", {
    url,
    model: openAIRealtimeModel,
    hasApiKey: Boolean(openAIApiKey),
  });

  const ws = new WebSocket(url, {
    handshakeTimeout: 10_000,
    headers: {
      Authorization: `Bearer ${openAIApiKey}`,
    },
  });

  const finish = (status: number, body: Record<string, unknown>) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }

    if (!res.headersSent) {
      res.status(status).json(body);
    }
  };

  ws.on("open", () => {
    finish(200, {
      ok: true,
      message: "OpenAI Realtime websocket opened successfully.",
      model: openAIRealtimeModel,
      elapsedMs: Date.now() - startedAt,
    });
  });

  ws.on("unexpected-response", (_request, response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    response.on("end", () => {
      finish(response.statusCode ?? 500, {
        ok: false,
        message: "OpenAI Realtime websocket handshake was rejected.",
        model: openAIRealtimeModel,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        body: Buffer.concat(chunks).toString("utf8"),
        elapsedMs: Date.now() - startedAt,
      });
    });
  });

  ws.on("error", (error) => {
    finish(500, {
      ok: false,
      message: "OpenAI Realtime websocket error.",
      model: openAIRealtimeModel,
      error: error.message,
      elapsedMs: Date.now() - startedAt,
    });
  });
});

const server = http.createServer(app);

const mediaStreamServer = new WebSocketServer({
  server,
  path: "/media-stream",
});

mediaStreamServer.on("connection", (ws, request) => {
  console.log("[server] Websocket connection accepted.", {
    path: request.url,
    remoteAddress: request.socket.remoteAddress,
  });

  handleTwilioMediaStream(ws, {
    openAIApiKey,
    businessId: defaultBusinessId,
  });
});

mediaStreamServer.on("error", (error) => {
  console.error("[server] Websocket server error:", error);
});

server.listen(port, () => {
  console.log(`[server] Voice server listening on http://localhost:${port}`);
  console.log(`[server] Twilio Voice webhook: http://localhost:${port}/twilio/voice`);
  console.log(`[server] Twilio Media Stream endpoint: ws://localhost:${port}/media-stream`);

  void loadSalonProfile({
    toPhone: process.env.TWILIO_PHONE_NUMBER,
    fallbackBusinessId: defaultBusinessId,
  })
    .then((profile) => {
      console.log("[server] Warmed salon profile cache.", {
        businessId: profile.businessId,
        businessName: profile.businessName,
      });
    })
    .catch((error) => {
      console.warn("[server] Could not warm salon profile cache.", error);
    });
});

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
