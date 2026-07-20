import { API_URL } from "@/lib/api";
import { revalidateTag } from "next/cache";

const ALLOWED_PATHS = new Set([
  "checkin",
  "coach/chat",
  "data-version",
  "profile",
  "google-health/status",
  "google-health/sync",
]);

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");

  if (!ALLOWED_PATHS.has(endpoint)) {
    return Response.json({ detail: "Ruta no permitida." }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "application/json";
  const response = await fetch(`${API_URL}/api/${endpoint}`, {
    method: request.method,
    headers: { "Content-Type": contentType },
    body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
  });

  if (request.method !== "GET" && response.ok) {
    revalidateTag("training-data", "max");
  }

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export const GET = proxy;
export const POST = proxy;
