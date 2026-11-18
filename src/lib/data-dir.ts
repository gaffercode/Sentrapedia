import path from "node:path";

// The private Sentrapedia data folder (Gaffer, 2026-11-18): theoracle/index/, oracle/sentrapedia.json and
// aadi/service/data/icd10.json, at the same relative paths as in the capsule. The server image never contains them;
// the beta container mounts them read-only at /data. Unset, it is the working folder, so a local checkout that holds
// the data keeps working unchanged.
export const sentrapediaDataDir = () => process.env.SENTRAPEDIA_DATA_DIR?.trim() || process.cwd();
// The ignore comment keeps the build from tracing (copying) the whole capsule, data included, into the server output:
// the path is only known at run time. scripts/leak-guard.mjs fails the deploy dry-run if that ever happens again.
export const dataPath = (...parts: string[]) => path.join(/*turbopackIgnore: true*/ sentrapediaDataDir(), ...parts);
