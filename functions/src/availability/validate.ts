import { HttpsError } from "firebase-functions/v2/https";
import { isDateKey } from "./slots";

type Obj = Record<string, unknown>;

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function asObject(v: unknown, what: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) bad(`${what} must be an object`);
  return v as Obj;
}

function docId(v: unknown, what: string): string {
  if (typeof v !== "string" || v === "" || v.includes("/")) bad(`${what} must be a document id`);
  return v;
}

/** getProviderSlots input. */
export function validateSlotsRequest(data: unknown): { instructorId: string; serviceId: string; date: string } {
  const d = asObject(data, "payload");
  const instructorId = docId(d.instructorId, "instructorId");
  const serviceId = docId(d.serviceId, "serviceId");
  if (!isDateKey(d.date)) bad("date must be YYYY-MM-DD");
  return { instructorId, serviceId, date: d.date };
}
