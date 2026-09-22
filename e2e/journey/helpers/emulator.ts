/**
 * Talking to the Firebase emulator suite over REST.
 *
 * The journey specs assert on what the app actually persisted, not just on what the UI
 * rendered — a booking that shows a confirmation toast but writes nothing is still a bug.
 * Reads go through the emulator's REST API with the `owner` bearer token, which bypasses
 * security rules: a test that reads as the owner sees the real document, so a rules change
 * cannot make an assertion silently pass by hiding a field.
 *
 * The project id must match the one the emulators run under (`.firebaserc` default) AND the
 * one the browser app is built with (`.env.e2e`). When they diverge the functions emulator
 * 404s every callable, because it serves them at /{projectId}/{region}/{name}.
 */

export const PROJECT_ID = process.env.E2E_PROJECT_ID ?? 'vfit-funlife';

const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';

const DOCS = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' };

/** Firestore's typed value wrapper, unwrapped to something a test can compare against. */
type FirestoreValue = Record<string, unknown>;

function decodeValue(value: FirestoreValue): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const arr = (value.arrayValue as { values?: FirestoreValue[] }).values ?? [];
    return arr.map(decodeValue);
  }
  if ('mapValue' in value) {
    return decodeFields((value.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {});
  }
  return undefined;
}

function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

/** One document, decoded, or null when it does not exist. */
export async function getDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${DOCS}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`emulator read ${path} failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { fields?: Record<string, FirestoreValue> };
  return decodeFields(body.fields ?? {});
}

/** Every document in a collection, decoded, keyed by document id. */
export async function listDocs(
  collection: string
): Promise<Record<string, Record<string, unknown>>> {
  const res = await fetch(`${DOCS}/${collection}?pageSize=300`, { headers: OWNER });
  if (!res.ok) throw new Error(`emulator list ${collection} failed: ${res.status}`);
  const body = (await res.json()) as {
    documents?: { name: string; fields?: Record<string, FirestoreValue> }[];
  };
  return Object.fromEntries(
    (body.documents ?? []).map((d) => [d.name.split('/').pop() as string, decodeFields(d.fields ?? {})])
  );
}

/** Firestore's typed wrapper, built from a plain value. Mirrors `decodeValue`. */
function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  throw new Error(`cannot encode ${typeof value} for Firestore`);
}

function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)]));
}

/**
 * Write a document as the emulator's owner, bypassing rules.
 *
 * For *arranging* state a spec needs but is not itself testing — a booking that already
 * exists so the dashboard has something to count. Anything the spec is actually asserting
 * about should go through the app, or the test proves only that Firestore stores what you
 * put in it.
 */
export async function putDoc(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${DOCS}/${path}`, {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) throw new Error(`emulator write ${path} failed: ${res.status} ${await res.text()}`);
}

/** Remove a document. Missing documents are not an error, so this is safe in cleanup. */
export async function removeDoc(path: string): Promise<void> {
  const res = await fetch(`${DOCS}/${path}`, { method: 'DELETE', headers: OWNER });
  if (!res.ok && res.status !== 404) {
    throw new Error(`emulator delete ${path} failed: ${res.status}`);
  }
}

/**
 * Poll until `read` returns something truthy. Firestore writes made by a Cloud Function
 * land after the HTTP response the UI awaited, so asserting immediately is flaky in a way
 * that has nothing to do with the behaviour under test.
 */
export async function waitFor<T>(
  read: () => Promise<T | null | undefined | false>,
  { timeoutMs = 20_000, intervalMs = 400, what = 'condition' } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    last = await read();
    if (last) return last as T;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what} (last value: ${JSON.stringify(last)})`);
}

/**
 * The SMS code the Auth emulator "sent". This is what makes phone registration testable at
 * all: the emulator never sends an SMS, it just records the code, so the spec can drive the
 * real UI (country picker, OTP boxes, verify) without a real handset or a shared test
 * number configured in a console someone else can change.
 */
export async function latestSmsCode(phoneNumber: string): Promise<string> {
  return waitFor(
    async () => {
      const res = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/verificationCodes`);
      if (!res.ok) return null;
      const body = (await res.json()) as { verificationCodes?: { code: string; phoneNumber: string }[] };
      const mine = (body.verificationCodes ?? []).filter((c) => c.phoneNumber === phoneNumber);
      return mine.length ? mine[mine.length - 1].code : null;
    },
    { what: `an SMS code for ${phoneNumber}` }
  );
}

const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? 'localhost:5001';
const REGION = process.env.NEXT_PUBLIC_FIREBASE_REGION ?? 'europe-west1';

/**
 * Invoke a callable as a specific signed-in user, over HTTP.
 *
 * Callables are ordinary POST endpoints: `{ data }` in, `{ result }` or `{ error }` out, with
 * the caller identified by a bearer ID token. Going through the wire rather than the page's
 * SDK matters for the permission tests — a refusal has to be the *server* refusing, not a
 * button the UI declined to render, and this returns the error code that proves which.
 */
export async function callAs(
  idToken: string,
  name: string,
  data: unknown
): Promise<{ ok: true; data: unknown } | { ok: false; code: string; message: string }> {
  const res = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = (await res.json()) as {
    result?: unknown;
    error?: { status?: string; message?: string };
  };
  if (res.ok && !body.error) return { ok: true, data: body.result };
  return {
    ok: false,
    code: body.error?.status ?? String(res.status),
    message: body.error?.message ?? '',
  };
}

/** Fails loudly when the emulators are not up, rather than letting every spec time out. */
export async function assertEmulatorsReachable(): Promise<void> {
  for (const [name, url] of [
    ['firestore', `http://${FIRESTORE_HOST}/`],
    ['auth', `http://${AUTH_HOST}/`],
  ] as const) {
    try {
      await fetch(url);
    } catch {
      throw new Error(
        `The ${name} emulator is not reachable. Start the stack first:\n` +
          '  npm run emulators\n  npm run seed:emulator\n  npm run dev:e2e'
      );
    }
  }
}
