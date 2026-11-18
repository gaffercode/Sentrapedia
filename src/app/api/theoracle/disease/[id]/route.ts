import { catalogueApi } from "../../../../../lib/theoracle-catalogue-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { return catalogueApi.disease((await params).id); }
