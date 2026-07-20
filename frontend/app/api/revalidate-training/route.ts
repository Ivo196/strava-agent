import { revalidateTag } from "next/cache";

export async function POST() {
  revalidateTag("training-data", "max");
  return Response.json({ revalidated: true });
}
