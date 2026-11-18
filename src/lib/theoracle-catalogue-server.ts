import "server-only";
import { getBetaAccess } from "./auth/server";
import { loadCatalogue } from "./theoracle-catalogue";
import { createCatalogueApi } from "./theoracle-catalogue-api";

// One instance per server process, so the daily detail count is shared by the three routes.
export const catalogueApi = createCatalogueApi({ access: () => getBetaAccess().resolve(), catalogue: loadCatalogue });
