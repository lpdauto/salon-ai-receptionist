import { suggestNewTime } from "@/lib/request-workflow";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const formData = await request.formData();
    await suggestNewTime(id, String(formData.get("suggested_datetime_text") ?? ""));
    return Response.redirect(new URL("/dashboard/requests", request.url));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not suggest new time." }, { status: 500 });
  }
}
