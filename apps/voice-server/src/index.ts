import "dotenv/config";
import express from "express";
import http from "http";
import WebSocket from "ws";
import { WebSocketServer } from "ws";
import { handleTwilioMediaStream } from "./twilioStream";

const openAIRealtimeModel = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";

const port = Number(process.env.PORT ?? 3001);
const openAIApiKey = process.env.OPENAI_API_KEY;

if (!openAIApiKey) {
  throw new Error("OPENAI_API_KEY is required. Add it to apps/voice-server/.env.");
}

const app = express();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "voice-server",
  });
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

  handleTwilioMediaStream(ws, openAIApiKey);
});

mediaStreamServer.on("error", (error) => {
  console.error("[server] Websocket server error:", error);
});

server.listen(port, () => {
  console.log(`[server] Voice server listening on http://localhost:${port}`);
  console.log(`[server] Twilio Media Stream endpoint: ws://localhost:${port}/media-stream`);
});
