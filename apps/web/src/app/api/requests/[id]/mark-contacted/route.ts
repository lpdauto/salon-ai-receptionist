import { markRequestContacted } from "@/lib/request-workflow";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await markRequestContacted(id);
    return Response.redirect(new URL("/dashboard/requests", request.url));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not mark contacted." }, { status: 500 });
  }
}
