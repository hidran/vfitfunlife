import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate, mockGet, mockDoc, mockCollection } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockGet = vi.fn();
  const mockDoc = vi.fn(() => ({ create: mockCreate, get: mockGet }));
  const mockCollection = vi.fn(() => ({ doc: mockDoc }));
  return { mockCreate, mockGet, mockDoc, mockCollection };
});

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({ collection: mockCollection }),
  FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" },
}));

import { writeAuditLogOnce, auditLogExists } from "./audit";
import type { ServerAuditPayload } from "./audit";

function grpcError(code: number, message = "boom") {
  return Object.assign(new Error(message), { code });
}

const payload: ServerAuditPayload = {
  actorUid: "me",
  actorEmail: "me@x.it",
  actorRole: "superadmin",
  action: "delete",
  entityType: "user",
  entityId: "u1",
  before: { role: "customer" },
  reason: "demo",
};

describe("writeAuditLogOnce", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGet.mockReset();
    mockDoc.mockClear();
    mockCollection.mockClear();
  });

  it("creates the doc at the given deterministic id", async () => {
    mockCreate.mockResolvedValue(undefined);
    await writeAuditLogOnce("bulk_job1_u1", payload);
    expect(mockCollection).toHaveBeenCalledWith("audit_logs");
    expect(mockDoc).toHaveBeenCalledWith("bulk_job1_u1");
    expect(mockCreate).toHaveBeenCalledWith({ ...payload, timestamp: "SERVER_TIMESTAMP" });
  });

  it("treats ALREADY_EXISTS (gRPC code 6) as success", async () => {
    mockCreate.mockRejectedValue(grpcError(6, "already exists"));
    await expect(writeAuditLogOnce("bulk_job1_u1", payload)).resolves.toBeUndefined();
  });

  it("propagates any other gRPC error", async () => {
    mockCreate.mockRejectedValue(grpcError(5, "not found"));
    await expect(writeAuditLogOnce("bulk_job1_u1", payload)).rejects.toThrow("not found");
  });

  it("propagates an error with no code at all", async () => {
    mockCreate.mockRejectedValue(new Error("boom"));
    await expect(writeAuditLogOnce("bulk_job1_u1", payload)).rejects.toThrow("boom");
  });
});

describe("auditLogExists", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("is true when the doc exists", async () => {
    mockGet.mockResolvedValue({ exists: true });
    await expect(auditLogExists("bulk_job1_u1")).resolves.toBe(true);
  });

  it("is false when it does not", async () => {
    mockGet.mockResolvedValue({ exists: false });
    await expect(auditLogExists("bulk_job1_u1")).resolves.toBe(false);
  });
});
