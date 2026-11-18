import { catalogueApi } from "../../../../lib/theoracle-catalogue-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) { return catalogueApi.search(request); }
