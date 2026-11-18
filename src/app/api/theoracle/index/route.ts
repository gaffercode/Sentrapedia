import { catalogueApi } from "../../../../lib/theoracle-catalogue-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() { return catalogueApi.index(); }
