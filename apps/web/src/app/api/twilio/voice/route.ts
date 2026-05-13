function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

type TwilioVoiceRequest = {
  from: string;
  to: string;
  callSid: string;
};

function buildTwiMl(twilioRequest: TwilioVoiceRequest) {
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
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="from" value="${escapeXml(twilioRequest.from)}" />
      <Parameter name="to" value="${escapeXml(twilioRequest.to)}" />
      <Parameter name="callSid" value="${escapeXml(twilioRequest.callSid)}" />
    </Stream>
  </Connect>
</Response>`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const from = String(formData.get("From") ?? "");
  const to = String(formData.get("To") ?? "");
  const callSid = String(formData.get("CallSid") ?? "");

  return new Response(buildTwiMl({ from, to, callSid }), {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
