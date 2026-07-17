import { API_URL } from "@/lib/api";

export async function GET() {
  const response = await fetch(`${API_URL}/api/apple-health/status`, {
    cache: "no-store",
  });
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
