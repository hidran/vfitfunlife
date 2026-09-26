import type { CallableOptions } from "firebase-functions/v2/https";

export const region = process.env.FIREBASE_REGION || "europe-west1";

const PRODUCTION_PROJECT_ID = "vfit-funlife";
const DEFAULT_PRODUCTION_HOT_MIN_INSTANCES = 1;

function nonNegativeInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function hotFunctionMinInstances(env: NodeJS.ProcessEnv = process.env): number {
  const explicit = nonNegativeInteger(env.FUNCTIONS_HOT_MIN_INSTANCES);
  if (explicit !== null) return explicit;
  return env.GCLOUD_PROJECT === PRODUCTION_PROJECT_ID ? DEFAULT_PRODUCTION_HOT_MIN_INSTANCES : 0;
}

export function hotCallableOptions<T = unknown>(
  options: CallableOptions<T> = {}
): CallableOptions<T> {
  return {
    region,
    minInstances: hotFunctionMinInstances(),
    ...options,
  };
}
