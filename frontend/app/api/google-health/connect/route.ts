import { API_URL } from "@/lib/api";

export async function GET() {
  const response = await fetch(`${API_URL}/api/google-health/connect`, {
    cache: "no-store",
    redirect: "manual",
  });
  const location = response.headers.get("location");
  if (!location) {
    return Response.json(
      { detail: "No se pudo iniciar la autorización de Google Health." },
      { status: 502 },
    );
  }
  return Response.redirect(location, 307);
}
