function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildTwiMl() {
  const streamUrl = process.env.VOICE_SERVER_WS_URL?.trim();

  if (!streamUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling. Our AI receptionist is being connected.</Say>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}" />
  </Connect>
</Response>`;
}

export async function POST() {
  return new Response(buildTwiMl(), {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
