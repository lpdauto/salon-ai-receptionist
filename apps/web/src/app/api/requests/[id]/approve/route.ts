import { approveAppointmentRequest } from "@/lib/request-workflow";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await approveAppointmentRequest(id);
    return Response.redirect(new URL("/dashboard/requests", _request.url));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not approve request." }, { status: 500 });
  }
}
