import { revalidateTag } from "next/cache";

export async function POST() {
  revalidateTag("training-data", { expire: 0 });
  return Response.json({ revalidated: true });
}
