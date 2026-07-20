import { API_URL } from "@/lib/api";
import { revalidateTag } from "next/cache";

const MAX_PAYLOAD_BYTES = 25_000_000;

export async function POST(request: Request) {
  const payload = await request.arrayBuffer();
  if (payload.byteLength > MAX_PAYLOAD_BYTES) {
    return Response.json(
      { detail: "El envío supera el límite de 25 MB." },
      { status: 413 },
    );
  }

  const response = await fetch(`${API_URL}/api/import/apple-health`, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      "X-API-Key": request.headers.get("x-api-key") ?? "",
      Authorization: request.headers.get("authorization") ?? "",
    },
    body: payload,
    cache: "no-store",
  });

  if (response.ok) {
    revalidateTag("training-data", "max");
  }

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
