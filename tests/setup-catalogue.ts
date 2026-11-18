import { loadCatalogue } from "../src/lib/theoracle-catalogue";

// The server fills the shared catalogue index and records from the data folder (src/lib/theoracle-catalogue.ts); the
// suites that render drafts or run the evidence gate get the same state the server has, from the same loader.
loadCatalogue();
