import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Handler-level wiring of applyAsProvider over an in-memory Firestore. The decisions
 * themselves are unit-tested beside their pure modules; this pins how the callable strings
 * them together — above all that a business never reaches commitProviderDecision (D2).
 *
 * The fake is deliberately strict where Firestore is:
 * - a plain `ref.get()` can be served a STALE snapshot (`h.stale`) while a transaction reads
 *   the current one (`h.docs`), so a test can prove a decision was taken on the transaction's
 *   read;
 * - a transaction refuses a read after a write, and its writes (like a batch's) only land in
 *   `h.ops` when it commits;
 * - `collection().doc(id)` throws for an id that does not name a document ("a/b"), like the
 *   Admin SDK;
 * - a batch write with a `lastUpdateTime` precondition fails with gRPC code 9 if the doc was
 *   written after that snapshot.
 */

type Ref = { path: string };
type Query = { collection: string; field: string; value: unknown };
type Op = [op: "create" | "delete" | "set" | "update", path: string, data?: unknown];
type Precondition = { lastUpdateTime?: { path: string; version: number | "stale" } };

const h = vi.hoisted(() => {
  /** The current documents: what a transaction (and commitProviderDecision) reads. */
  const docs = new Map<string, Record<string, unknown>>();
  /** Bumped on every write through `put`; a snapshot's updateTime carries it. */
  const versions = new Map<string, number>();
  /** Stale snapshots served to a plain ref.get() instead of `docs` (null: "did not exist yet"). */
  const stale = new Map<string, Record<string, unknown> | null>();
  /** Committed writes, in order. */
  const ops: Op[] = [];
  const settings = { autoApprove: true };
  const commitProviderDecision = vi.fn();
  const state = {
    /** Run the real commitProviderDecision instead of the mock. */
    realCommit: false,
    /** Runs once, just before the next batch commit checks its preconditions. */
    beforeCommit: null as null | (() => void),
    batchCommits: 0,
  };

  const put = (path: string, data: Record<string, unknown>) => {
    docs.set(path, data);
    versions.set(path, (versions.get(path) ?? 0) + 1);
  };
  const snapOf = (path: string, data: Record<string, unknown> | undefined, version: number | "stale") => ({
    exists: data !== undefined,
    data: () => data,
    updateTime: data ? { path, version } : undefined,
  });
  const fresh = (path: string) => snapOf(path, docs.get(path), versions.get(path) ?? 0);
  const outer = (path: string) =>
    stale.has(path) ? snapOf(path, stale.get(path) ?? undefined, "stale") : fresh(path);

  let autoId = 0;
  const docRef = (collectionPath: string, id: string): Record<string, unknown> & Ref => {
    const path = `${collectionPath}/${id}`;
    if (!id || path.split("/").length % 2 !== 0) {
      throw new Error(`Value for argument "documentPath" must point to a document, but was "${id}".`);
    }
    return {
      path,
      get: async () => outer(path),
      collection: (sub: string) => ({
        limit: () => ({ get: async () => ({ empty: true }) }),
        doc: (subId: string) => docRef(`${path}/${sub}`, subId),
      }),
    };
  };

  const runQuery = (q: Query) => ({
    docs: [...docs]
      .filter(([path, data]) => {
        const [collection, id, ...rest] = path.split("/");
        return collection === q.collection && id && rest.length === 0 && data[q.field] === q.value;
      })
      .map(([path, data]) => ({ id: path.split("/")[1], ref: { path }, data: () => data })),
  });

  const db = {
    collection: (name: string) => ({
      doc: (id?: string) => docRef(name, id ?? `auto-${++autoId}`),
      where: (field: string, op: string, value: unknown): Query => {
        if (op !== "==") throw new Error(`fake supports == only, got ${op}`);
        return { collection: name, field, value };
      },
    }),
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) => {
      const writes: Op[] = [];
      const record = (op: Op[0]) => (r: Ref, data?: unknown) => {
        writes.push(data === undefined ? [op, r.path] : [op, r.path, data]);
      };
      const tx = {
        get: async (target: Ref | Query) => {
          if (writes.length) {
            throw new Error("Firestore transactions require all reads to be executed before all writes.");
          }
          return "path" in target ? fresh(target.path) : runQuery(target);
        },
        create: record("create"),
        delete: record("delete"),
        set: record("set"),
        update: record("update"),
      };
      const result = await fn(tx);
      ops.push(...writes);
      return result;
    },
    batch: () => {
      const writes: Array<[Op, Precondition | undefined]> = [];
      return {
        set: (r: Ref, data: unknown) => {
          writes.push([["set", r.path, data], undefined]);
        },
        update: (r: Ref, data: unknown, precondition?: Precondition) => {
          writes.push([["update", r.path, data], precondition]);
        },
        commit: async () => {
          state.batchCommits++;
          const hook = state.beforeCommit;
          state.beforeCommit = null;
          hook?.();
          for (const [[, path], pre] of writes) {
            if (pre?.lastUpdateTime && pre.lastUpdateTime.version !== (versions.get(path) ?? 0)) {
              throw Object.assign(new Error("9 FAILED_PRECONDITION: the stored version does not match"), { code: 9 });
            }
          }
          ops.push(...writes.map(([op]) => op));
        },
      };
    },
  };
  return { docs, versions, stale, ops, settings, commitProviderDecision, state, put, db };
});

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => h.db,
  FieldValue: { serverTimestamp: () => "NOW" },
}));
vi.mock("../lib/cachedDoc", () => ({ cachedDocRead: async () => h.settings }));
// The real commitProviderDecision when a test asks for it, the mock otherwise.
vi.mock("./commitDecision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commitDecision")>();
  return {
    ...actual,
    commitProviderDecision: (opts: Parameters<typeof actual.commitProviderDecision>[0]) =>
      h.state.realCommit ? actual.commitProviderDecision(opts) : h.commitProviderDecision(opts),
  };
});
// utils/roles opens admin.firestore() at module load; only its permission table is used here.
vi.mock("../utils/roles", () => ({
  getDefaultPermissionsForRole: () => ["bookings:read", "services:read"],
}));

import { applyAsProvider } from "./applyAsProvider";

function call(data: Record<string, unknown>) {
  return (applyAsProvider as unknown as { run: (r: unknown) => Promise<unknown> }).run({
    auth: { uid: "u1", token: { email: "mario@example.it" } },
    data,
  });
}

/** Every key, at any depth, whose name contains a dot. */
function dottedKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => dottedKeys(v, `${path}${i}/`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(k.includes(".") ? [`${path}${k}`] : []),
    ...dottedKeys(v, `${path}${k}/`),
  ]);
}

const COMPANY = {
  legalName: "Karate Club Milano S.r.l.",
  vatNumber: "IT 123 456 789 03",
  displayName: "Karate Club Milano",
};
const VAT = "12345678903";
const OLD_VAT = "00743110157";
const STRAY_VAT = "01114601006";
const USER = { fullName: "Mario Rossi", role: "customer", email: "mario@example.it" };

const PENDING = { applicationStatus: "pending", providerProfile: { isVerified: false, bio: "Dal 1990", rating: 0, reviewCount: 0 } };
const APPROVED = { applicationStatus: "verified", providerProfile: { isVerified: true } };

const paths = () => h.ops.map(([op, path]) => [op, path]);

describe("applyAsProvider (handler)", () => {
  beforeEach(() => {
    h.docs.clear();
    h.versions.clear();
    h.stale.clear();
    h.ops.length = 0;
    h.settings.autoApprove = true;
    h.state.realCommit = false;
    h.state.beforeCommit = null;
    h.state.batchCommits = 0;
    h.commitProviderDecision.mockReset();
    h.commitProviderDecision.mockResolvedValue({ draftServicesSeeded: 1 });
    h.put("users/u1", USER);
  });

  it("the fake transaction refuses a read after a write, so every business test proves reads come first", async () => {
    await expect(
      h.db.runTransaction(async (t) => {
        const tx = t as { get(r: Ref): Promise<unknown>; set(r: Ref, d: unknown): void };
        tx.set({ path: "users/u1" }, {});
        await tx.get({ path: "users/u1" });
      }),
    ).rejects.toThrow("all reads to be executed before all writes");
  });

  it("queues a business for review even with auto-approval ON — commitProviderDecision is never called", async () => {
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toEqual({
      success: true,
      providerId: "u1",
      autoApproved: false,
      draftServicesSeeded: 0,
    });
    expect(h.commitProviderDecision).not.toHaveBeenCalled();

    expect(h.ops).toEqual([
      ["create", `businessVat/${VAT}`, { uid: "u1", createdAt: "NOW" }],
      ["set", "instructors/u1", expect.objectContaining({
        name: "Karate Club Milano",
        applicationStatus: "pending",
        providerProfile: { isVerified: false, bio: "", rating: 0, reviewCount: 0 },
        business: expect.objectContaining({ vatNumber: VAT, legalForm: "company", affiliationNumber: "" }),
      })],
      ["update", "users/u1", { providerStatus: "pending", providerType: "business", updatedAt: "NOW" }],
    ]);
    expect(dottedKeys(h.ops)).toEqual([]);
  });

  it("registers an association under its codice fiscale, with legal form and affiliation number nested", async () => {
    const cf = "97123456788"; // an association's numeric codice fiscale (checksum-valid, no P.IVA office code)
    await call({
      categoryIds: ["hiit"],
      providerType: "business",
      business: { legalName: "ASD Sport e Salute", vatNumber: cf, legalForm: "association", affiliationNumber: " RASD 12345 " },
    });
    expect(paths()).toEqual([["create", `businessVat/${cf}`], ["set", "instructors/u1"], ["update", "users/u1"]]);
    expect((h.ops[1][2] as Record<string, unknown>).business).toMatchObject({
      vatNumber: cf,
      legalForm: "association",
      affiliationNumber: "RASD 12345",
    });
    expect(dottedKeys(h.ops)).toEqual([]);
  });

  it("refuses an unknown legal form or an over-long affiliation number before touching anything", async () => {
    await expect(
      call({ categoryIds: ["hiit"], providerType: "business", business: { ...COMPANY, legalForm: "srl" } }),
    ).rejects.toMatchObject({ code: "invalid-argument", message: "invalid_legal_form" });
    await expect(
      call({ categoryIds: ["hiit"], providerType: "business", business: { ...COMPANY, affiliationNumber: "9".repeat(41) } }),
    ).rejects.toMatchObject({ code: "invalid-argument", message: "invalid_affiliation_number" });
    expect(h.ops).toEqual([]);
  });

  it("still auto-approves an individual through commitProviderDecision, as before", async () => {
    await expect(call({ categoryIds: ["hiit"], fullName: "Mario Rossi" })).resolves.toMatchObject({
      autoApproved: true,
      draftServicesSeeded: 1,
    });
    expect(h.commitProviderDecision).toHaveBeenCalledTimes(1);
    expect(h.commitProviderDecision).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "u1",
      decision: "verified",
      application: { requestedCategoryIds: ["hiit"], fullName: "Mario Rossi" },
    }));
    expect(h.ops).toEqual([]);
  });

  it("retries the auto-approval once when the commit lost a race on users/{uid}", async () => {
    h.commitProviderDecision
      .mockRejectedValueOnce(new HttpsError("aborted", "concurrent_update"))
      .mockResolvedValueOnce({ draftServicesSeeded: 1 });
    await expect(call({ categoryIds: ["hiit"] })).resolves.toMatchObject({ autoApproved: true });
    expect(h.commitProviderDecision).toHaveBeenCalledTimes(2);
  });

  it("with the real commitProviderDecision: a business landing between read and commit is refused on the retry", async () => {
    h.state.realCommit = true;
    // The business transaction commits after commitProviderDecision read users/{uid} but before
    // its batch commits: the lastUpdateTime guard fails (code 9), the handler retries once, and
    // the retry's own reads now show a business.
    h.state.beforeCommit = () => {
      h.put("users/u1", { ...USER, providerStatus: "pending", providerType: "business" });
      h.put("instructors/u1", { ...PENDING, business: { legalName: COMPANY.legalName, vatNumber: VAT } });
    };
    await expect(call({ categoryIds: ["hiit"], fullName: "Mario Rossi" })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "business_account_exists",
    });
    expect(h.state.batchCommits).toBe(1); // the retry was refused before it could commit
    expect(h.ops).toEqual([]); // and the first attempt wrote nothing
  });

  it("refuses an individual application from an account that is already a business", async () => {
    h.put("users/u1", { ...USER, providerType: "business" });
    await expect(call({ categoryIds: ["hiit"] })).rejects.toMatchObject({
      code: "failed-precondition",
      message: "business_account_exists",
    });
    expect(h.commitProviderDecision).not.toHaveBeenCalled();
    expect(h.ops).toEqual([]);
  });

  it("refuses ANY business re-apply from an approved business, judged on the in-transaction reads", async () => {
    for (const [user, instructor] of [
      // Same tax id: this used to drop the approved company back to pending and de-list it.
      [USER, { ...APPROVED, business: { ...COMPANY, vatNumber: VAT } }],
      // Another tax id.
      [USER, { ...APPROVED, business: { ...COMPANY, vatNumber: OLD_VAT } }],
      // A legacy doc, approved by its flag alone.
      [USER, { providerProfile: { isVerified: true }, business: { ...COMPANY, vatNumber: VAT } }],
      // The client removed instructors.business, but users.providerType cannot be removed.
      [{ ...USER, providerType: "business" }, { ...APPROVED }],
    ] as const) {
      h.ops.length = 0;
      h.put("users/u1", user);
      h.put("instructors/u1", instructor);
      h.put(`businessVat/${VAT}`, { uid: "u1" });
      h.put(`businessVat/${OLD_VAT}`, { uid: "u1" });
      // Outside the transaction the handler would still see a plain customer with no
      // instructors doc: only the transaction's reads show the approved business.
      h.stale.set("users/u1", USER);
      h.stale.set("instructors/u1", null);
      await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).rejects.toMatchObject({
        code: "failed-precondition",
        message: "business_already_approved",
      });
      expect(h.ops).toEqual([]);
    }
  });

  it("a rejected business may re-apply with the same tax id", async () => {
    h.put("instructors/u1", { ...PENDING, applicationStatus: "rejected", business: { ...COMPANY, vatNumber: VAT } });
    h.put(`businessVat/${VAT}`, { uid: "u1" });
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toMatchObject({
      autoApproved: false,
    });
    expect(paths()).toEqual([["set", "instructors/u1"], ["update", "users/u1"]]);
  });

  it("a verified individual may still apply as a business (plan §5 default) and is queued", async () => {
    h.put("users/u1", { ...USER, role: "provider", providerStatus: "verified", isVerified: true });
    h.put("instructors/u1", { ...APPROVED, name: "Mario Rossi" });
    await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toMatchObject({
      autoApproved: false,
    });
    expect(paths()).toEqual([["create", `businessVat/${VAT}`], ["set", "instructors/u1"], ["update", "users/u1"]]);
  });

  it("a pending business moving to a new tax id releases the old claim and keeps its profile", async () => {
    h.put("instructors/u1", { ...PENDING, business: { ...COMPANY, vatNumber: OLD_VAT } });
    h.put(`businessVat/${OLD_VAT}`, { uid: "u1" });
    // A stale outer read that has no instructors doc yet: the write must still follow the
    // transaction's read (doc exists ⇒ no createdAt, no profile defaults).
    h.stale.set("instructors/u1", null);
    await call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY });
    expect(paths()).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["create", `businessVat/${VAT}`],
      ["set", "instructors/u1"],
      ["update", "users/u1"],
    ]);
    const instructorWrite = h.ops[2][2] as Record<string, unknown>;
    expect(instructorWrite.providerProfile).toEqual({ isVerified: false });
    expect(instructorWrite).not.toHaveProperty("createdAt");
  });

  it("releases every claim the account holds besides the one it takes, whatever its instructors doc says", async () => {
    // The stored number was edited from the client between applications (possible until B4), so
    // claims piled up under this account; another account's claim is left alone.
    h.put("instructors/u1", { ...PENDING, business: { ...COMPANY, vatNumber: VAT } });
    h.put(`businessVat/${OLD_VAT}`, { uid: "u1" });
    h.put(`businessVat/${STRAY_VAT}`, { uid: "u1" });
    h.put("businessVat/97123456788", { uid: "someone-else" });
    await call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY });
    expect(paths()).toEqual([
      ["delete", `businessVat/${OLD_VAT}`],
      ["delete", `businessVat/${STRAY_VAT}`],
      ["create", `businessVat/${VAT}`],
      ["set", "instructors/u1"],
      ["update", "users/u1"],
    ]);
  });

  it("a client-written stored tax id like \"a/b\" is never used as a document id (no `internal`)", async () => {
    for (const stored of ["a/b", "a/b/c"]) {
      h.ops.length = 0;
      h.docs.delete(`businessVat/${VAT}`);
      h.put("instructors/u1", { ...PENDING, business: { ...COMPANY, vatNumber: stored } });
      h.put(`businessVat/${OLD_VAT}`, { uid: "u1" });
      await expect(call({ categoryIds: ["hiit"], providerType: "business", business: COMPANY })).resolves.toMatchObject({
        autoApproved: false,
      });
      expect(paths()).toEqual([
        ["delete", `businessVat/${OLD_VAT}`],
        ["create", `businessVat/${VAT}`],
        ["set", "instructors/u1"],
        ["update", "users/u1"],
      ]);
    }
  });
});
