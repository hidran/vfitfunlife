/**
 * A small, stateful, in-memory stand-in for the Admin SDK's Firestore, for handler-level unit
 * tests (not the emulator). Shared by the provider/business tests so every one of them gets the
 * same Firestore-like strictness:
 *
 * - committed writes are APPLIED to shared state (`docs`), so a sequence of calls sees what the
 *   earlier ones wrote; every applied write bumps that doc's version;
 * - a transaction refuses a read after a write, buffers its writes, and only applies them when
 *   it commits — atomically: `create` on an existing doc (code 6) or `update` on a missing doc
 *   (code 5) fails the whole commit and nothing lands;
 * - contention is detected like Firestore does it: if any doc or query the transaction read
 *   changed before its commit, the commit is aborted and the transaction function is RE-RUN
 *   (fresh reads), up to `state.maxAttempts` times, then it fails with code 10 (ABORTED) — the
 *   Node SDK's behaviour. An HttpsError thrown by the function is never retried;
 * - `state.beforeCommit` runs once, after the next transaction (or batch) has done its reads and
 *   queued its writes but before it commits — a test can commit a competing write there (even a
 *   whole other callable) to reproduce an interleaving;
 * - `collection().doc(id)` throws for an id that does not name a document ("a/b");
 * - a plain `ref.get()` can be served a STALE snapshot (`stale`) while transactions read the
 *   current one, to prove a decision was taken on the transaction's read;
 * - `FieldValue.serverTimestamp()` is the string "NOW"; `FieldValue.delete()` is the `DELETE`
 *   sentinel, which removes the field when applied (so a test can tell a delete from a null).
 *
 * Writes are recorded in `ops` in commit order as [op, path, data?, options?].
 */

export const DELETE = Object.freeze({ fieldValue: "delete" });
export const NOW = "NOW";

export type Op = [op: "create" | "delete" | "set" | "update" | "add", path: string, data?: unknown, options?: unknown];
type Data = Record<string, unknown>;

interface QuerySpec {
  collection: string;
  filters: Array<[field: string, value: unknown]>;
  limit?: number;
}

export interface FakeDocRef {
  kind: "doc";
  path: string;
  id: string;
  get(): Promise<FakeDocSnapshot>;
  set(data: Data, options?: { merge?: boolean }): Promise<void>;
  update(data: Data): Promise<void>;
  create(data: Data): Promise<void>;
  delete(): Promise<void>;
  collection(sub: string): FakeCollectionRef;
}

export interface FakeQuery {
  kind: "query";
  spec: QuerySpec;
  where(field: string, op: string, value: unknown): FakeQuery;
  limit(n: number): FakeQuery;
  get(): Promise<FakeQuerySnapshot>;
}

export interface FakeCollectionRef extends FakeQuery {
  path: string;
  doc(id?: string): FakeDocRef;
  add(data: Data): Promise<FakeDocRef>;
}

export interface FakeDocSnapshot {
  exists: boolean;
  id: string;
  ref: FakeDocRef;
  data(): Data | undefined;
  updateTime?: { path: string; version: number };
}

export interface FakeQuerySnapshot {
  docs: Array<{ id: string; ref: FakeDocRef; exists: true; data(): Data }>;
  empty: boolean;
  size: number;
}

function grpcError(code: number, message: string): Error {
  return Object.assign(new Error(`${code} ${message}`), { code });
}

function isPlainObject(value: unknown): value is Data {
  return (
    !!value &&
    typeof value === "object" &&
    value !== DELETE &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** A deep copy of stored data, so a snapshot never aliases state. */
function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
}

/** set(..., { merge: true }): nested maps merge field by field; DELETE removes. */
function mergeInto(target: Data, patch: Data): Data {
  const out: Data = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) delete out[key];
    else if (isPlainObject(value)) out[key] = mergeInto(isPlainObject(out[key]) ? (out[key] as Data) : {}, value);
    else out[key] = clone(value);
  }
  return out;
}

/** set() without merge: the doc becomes exactly `data` (DELETE sentinels dropped). */
function replaceWith(data: Data): Data {
  return mergeInto({}, data);
}

/** update(): dotted keys are field paths; a map value REPLACES the field; DELETE removes. */
function applyUpdate(target: Data, patch: Data): Data {
  const out = clone(target);
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split(".");
    let node: Data = out;
    for (const part of parts.slice(0, -1)) {
      if (!isPlainObject(node[part])) node[part] = {};
      node = node[part] as Data;
    }
    const leaf = parts[parts.length - 1];
    if (value === DELETE) delete node[leaf];
    else node[leaf] = isPlainObject(value) ? replaceWith(value) : clone(value);
  }
  return out;
}

function fieldOf(data: Data, field: string): unknown {
  let node: unknown = data;
  for (const part of field.split(".")) {
    if (!isPlainObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

export function createFakeFirestore() {
  const docs = new Map<string, Data>();
  const versions = new Map<string, number>();
  const stale = new Map<string, Data | null>();
  const ops: Op[] = [];
  const state = {
    beforeCommit: null as null | (() => void | Promise<void>),
    /** Transactions started (one per runTransaction call, however many attempts). */
    transactions: 0,
    /** Transaction function runs, including retries. */
    attempts: 0,
    /** Successful transaction and batch commits. */
    commits: 0,
    maxAttempts: 5,
  };
  let autoId = 0;

  const put = (path: string, data: Data) => {
    docs.set(path, clone(data));
    versions.set(path, (versions.get(path) ?? 0) + 1);
  };
  const remove = (path: string) => {
    if (docs.delete(path)) versions.set(path, (versions.get(path) ?? 0) + 1);
  };

  const snapshotOf = (ref: FakeDocRef, data: Data | undefined, version: number): FakeDocSnapshot => ({
    exists: data !== undefined,
    id: ref.id,
    ref,
    data: () => (data === undefined ? undefined : clone(data)),
    updateTime: data === undefined ? undefined : { path: ref.path, version },
  });
  const freshSnapshot = (ref: FakeDocRef) => snapshotOf(ref, docs.get(ref.path), versions.get(ref.path) ?? 0);

  const runQuery = (spec: QuerySpec): FakeQuerySnapshot => {
    const matched = [...docs]
      .filter(([path, data]) => {
        if (!path.startsWith(`${spec.collection}/`)) return false;
        if (path.slice(spec.collection.length + 1).includes("/")) return false;
        return spec.filters.every(([field, value]) => fieldOf(data, field) === value);
      })
      .slice(0, spec.limit ?? Infinity)
      .map(([path, data]) => {
        const ref = docRef(path);
        return { id: ref.id, ref, exists: true as const, data: () => clone(data) };
      });
    return { docs: matched, empty: matched.length === 0, size: matched.length };
  };

  /** What contention detection compares: a doc's version, or a query's matched docs+versions. */
  const fingerprint = (target: FakeDocRef | FakeQuery): string =>
    target.kind === "doc" ?
      `${docs.has(target.path)}:${versions.get(target.path) ?? 0}` :
      JSON.stringify(runQuery(target.spec).docs.map((d) => [d.ref.path, versions.get(d.ref.path) ?? 0]));

  /** Apply one commit's writes atomically, in order; any failure leaves state untouched. */
  const commitWrites = (writes: Op[]) => {
    const working = new Map<string, Data | undefined>();
    const current = (path: string) => (working.has(path) ? working.get(path) : docs.get(path));
    for (const [op, path, data, options] of writes) {
      const existing = current(path);
      if (op === "create" || op === "add") {
        if (existing !== undefined) throw grpcError(6, `ALREADY_EXISTS: Document already exists: ${path}`);
        working.set(path, replaceWith(data as Data));
      } else if (op === "update") {
        if (existing === undefined) throw grpcError(5, `NOT_FOUND: No document to update: ${path}`);
        working.set(path, applyUpdate(existing, data as Data));
      } else if (op === "set") {
        const merge = (options as { merge?: boolean } | undefined)?.merge;
        working.set(path, merge ? mergeInto(existing ?? {}, data as Data) : replaceWith(data as Data));
      } else {
        working.set(path, undefined);
      }
    }
    for (const [path, data] of working) {
      if (data === undefined) remove(path);
      else put(path, data);
    }
    ops.push(...writes);
    state.commits++;
  };

  const recorder = (writes: Op[]) => ({
    create: (ref: FakeDocRef, data: Data) => {
      writes.push(["create", ref.path, data]);
    },
    set: (ref: FakeDocRef, data: Data, options?: unknown) => {
      writes.push(options === undefined ? ["set", ref.path, data] : ["set", ref.path, data, options]);
    },
    update: (ref: FakeDocRef, data: Data) => {
      writes.push(["update", ref.path, data]);
    },
    delete: (ref: FakeDocRef) => {
      writes.push(["delete", ref.path]);
    },
  });

  const takeHook = async () => {
    const hook = state.beforeCommit;
    state.beforeCommit = null;
    await hook?.();
  };

  function query(spec: QuerySpec): FakeQuery {
    return {
      kind: "query",
      spec,
      where: (field, op, value) => {
        if (op !== "==") throw new Error(`fake supports == only, got ${op}`);
        return query({ ...spec, filters: [...spec.filters, [field, value]] });
      },
      limit: (n) => query({ ...spec, limit: n }),
      get: async () => runQuery(spec),
    };
  }

  function collection(path: string): FakeCollectionRef {
    return {
      ...query({ collection: path, filters: [] }),
      path,
      doc: (id?: string) => docRef(`${path}/${id ?? `auto-${++autoId}`}`, id === undefined ? undefined : id),
      add: async (data: Data) => {
        const ref = docRef(`${path}/auto-${++autoId}`);
        commitWrites([["add", ref.path, data]]);
        return ref;
      },
    };
  }

  function docRef(path: string, rawId?: string): FakeDocRef {
    const id = rawId ?? path.split("/").pop() ?? "";
    if (!id || path.split("/").length % 2 !== 0 || path.split("/").some((part) => !part)) {
      throw new Error(`Value for argument "documentPath" must point to a document, but was "${rawId ?? path}".`);
    }
    const ref: FakeDocRef = {
      kind: "doc",
      path,
      id,
      get: async () => (stale.has(path) ? snapshotOf(ref, stale.get(path) ?? undefined, -1) : freshSnapshot(ref)),
      set: async (data, options) => commitWrites([options === undefined ? ["set", path, data] : ["set", path, data, options]]),
      update: async (data) => commitWrites([["update", path, data]]),
      create: async (data) => commitWrites([["create", path, data]]),
      delete: async () => commitWrites([["delete", path]]),
      collection: (sub: string) => collection(`${path}/${sub}`),
    };
    return ref;
  }

  const db = {
    collection,
    doc: (path: string) => docRef(path),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      state.transactions++;
      let lastError: unknown;
      for (let attempt = 0; attempt < state.maxAttempts; attempt++) {
        state.attempts++;
        const reads: Array<FakeDocRef | FakeQuery> = [];
        const seen: string[] = [];
        const writes: Op[] = [];
        const tx = {
          get: async (target: FakeDocRef | FakeQuery) => {
            if (writes.length) {
              throw new Error("Firestore transactions require all reads to be executed before all writes.");
            }
            reads.push(target);
            seen.push(fingerprint(target));
            return target.kind === "doc" ? freshSnapshot(target) : runQuery(target.spec);
          },
          ...recorder(writes),
        };
        const result = await fn(tx);
        await takeHook();
        if (reads.some((target, i) => fingerprint(target) !== seen[i])) {
          lastError = grpcError(10, "ABORTED: Too much contention on these documents. Please try again.");
          continue;
        }
        commitWrites(writes);
        return result;
      }
      throw lastError;
    },
    batch: () => {
      const writes: Op[] = [];
      return {
        ...recorder(writes),
        commit: async () => {
          await takeHook();
          commitWrites(writes);
        },
      };
    },
  };

  const reset = () => {
    docs.clear();
    versions.clear();
    stale.clear();
    ops.length = 0;
    state.beforeCommit = null;
    state.transactions = 0;
    state.attempts = 0;
    state.commits = 0;
    state.maxAttempts = 5;
  };

  return {
    db,
    FieldValue: { serverTimestamp: () => NOW, delete: () => DELETE },
    DELETE,
    docs,
    versions,
    stale,
    ops,
    state,
    put,
    remove,
    reset,
    /** The current data of a doc (a copy), or undefined. */
    read: (path: string) => (docs.has(path) ? clone(docs.get(path)) : undefined),
  };
}

export type FakeFirestore = ReturnType<typeof createFakeFirestore>;

/** Every key, at any depth, whose name contains a dot. */
export function dottedKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => dottedKeys(v, `${path}${i}/`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(k.includes(".") ? [`${path}${k}`] : []),
    ...dottedKeys(v, `${path}${k}/`),
  ]);
}
