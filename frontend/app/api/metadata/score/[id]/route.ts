import { scoreMetadataResponseV3 } from "@/lib/metadata-route";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return scoreMetadataResponseV3(req, params);
}
