import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable fixtures, hoisted so they are reachable inside vi.mock factories.
const fx = vi.hoisted(() => ({
  // Per-uid role docs read by getUserRoleInfo (users/{uid}).
  users: {} as Record<string, Record<string, unknown> | undefined>,
  // The clients/{clientId} doc.
  client: { exists: true, data: () => ({}) as Record<string, unknown> },
  addSpy: vi.fn(async () => ({ id: "newPlan1" })),
  // Which subcollection .add was invoked on.
  lastSubcollection: "" as string,
  settings: { enabled: true, provider: "google", model: "gemini-2.5-flash", temperature: 0.4, maxOutputTokens: 4096, dailyQuota: 20 },
  generateObjectSpy: vi.fn(async () => ({ object: { title: "Plan", durationWeeks: 4, daysPerWeek: 3, weeks: [] }, usage: { inputTokens: 10, outputTokens: 20 } })),
}));

vi.mock("firebase-admin", () => {
  const firestore = () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (name === "users") {
            const data = fx.users[id];
            return { exists: !!data, data: () => data };
          }
          if (name === "clients") {
            return { exists: fx.client.exists, data: fx.client.data };
          }
          return { exists: false, data: () => undefined };
        },
        collection: (sub: string) => ({
          add: (...args: unknown[]) => {
            fx.lastSubcollection = sub;
            return fx.addSpy(...args);
          },
          where: () => ({
            get: async () => ({ docs: [] }),
          }),
        }),
      }),
      where: () => ({
        where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
        limit: () => ({ get: async () => ({ docs: [] }) }),
        get: async () => ({ docs: [] }),
      }),
    }),
  });
  (firestore as unknown as { FieldValue: unknown }).FieldValue = {
    serverTimestamp: () => "SERVER_TS",
    increment: (n: number) => ({ __inc: n }),
  };
  return { firestore };
});

vi.mock("../providers", () => ({
  buildModel: () => ({ __model: true }),
  AI_SECRETS: [],
}));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => fx.generateObjectSpy(...args),
}));

vi.mock("../quota", () => ({
  reserveQuota: vi.fn(async () => undefined),
  recordTokens: vi.fn(async () => undefined),
  releaseQuota: vi.fn(async () => undefined),
}));

vi.mock("./settings", () => ({
  getAiAuthoringSettings: async () => fx.settings,
}));

vi.mock("../../lib/audit", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

import { generateTrainingProgram } from "./generate";

// onCall wraps a handler; .run invokes it with the CallableRequest in firebase-functions v2.
function invoke(fn: unknown, request: unknown) {
  return (fn as { run: (r: unknown) => Promise<unknown> }).run(request);
}

const baseParams = { durationWeeks: 4, daysPerWeek: 3 };

describe("generateTrainingProgram authorization", () => {
  beforeEach(() => {
    fx.users = {};
    fx.client = { exists: true, data: () => ({ providerId: "ownerProvider", userId: "cust1" }) };
    fx.addSpy.mockClear();
    fx.lastSubcollection = "";
    fx.settings = { enabled: true, provider: "google", model: "gemini-2.5-flash", temperature: 0.4, maxOutputTokens: 4096, dailyQuota: 20 };
    fx.generateObjectSpy.mockClear();
  });

  it("rejects a provider who does not own the client", async () => {
    fx.users = { strangerProvider: { role: "provider" } };
    await expect(
      invoke(generateTrainingProgram, { auth: { uid: "strangerProvider", token: {} }, data: { clientId: "c1", params: baseParams } }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(fx.addSpy).not.toHaveBeenCalled();
  });

  it("allows the owner provider and writes to trainingPrograms with source:ai", async () => {
    fx.users = { ownerProvider: { role: "provider" } };
    const res = (await invoke(generateTrainingProgram, {
      auth: { uid: "ownerProvider", token: { email: "p@vfit.dev" } },
      data: { clientId: "c1", params: baseParams },
    })) as { id: string; source: string };
    expect(fx.addSpy).toHaveBeenCalledTimes(1);
    expect(fx.lastSubcollection).toBe("trainingPrograms");
    const payload = fx.addSpy.mock.calls[0][0] as { source: string; status: string };
    expect(payload.source).toBe("ai");
    expect(payload.status).toBe("active");
    expect(res.id).toBe("newPlan1");
    expect(res.source).toBe("ai");
  });

  it("rejects an owner provider whose account is deactivated", async () => {
    fx.users = { ownerProvider: { role: "provider", isActive: false } };
    await expect(
      invoke(generateTrainingProgram, {
        auth: { uid: "ownerProvider", token: {} },
        data: { clientId: "c1", params: baseParams },
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(fx.addSpy).not.toHaveBeenCalled();
  });

  it("throws failed-precondition when authoring is disabled", async () => {
    fx.users = { ownerProvider: { role: "provider" } };
    fx.settings = { ...fx.settings, enabled: false };
    await expect(
      invoke(generateTrainingProgram, { auth: { uid: "ownerProvider", token: {} }, data: { clientId: "c1", params: baseParams } }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fx.addSpy).not.toHaveBeenCalled();
  });
});
