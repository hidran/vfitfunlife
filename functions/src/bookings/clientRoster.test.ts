import { describe, it, expect, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { syncClientRoster } from "./clientRoster";

type Row = { id: string; data: Record<string, unknown> };

/** Minimal Firestore double: equality-only queries, a transaction that records its writes. */
function fakeDb(tables: Record<string, Row[]>) {
  const writes: { op: string; path: string; data: Record<string, unknown> }[] = [];
  const query = (name: string, filters: [string, unknown][] = []) => ({
    kind: "query" as const,
    name,
    filters,
    where: (field: string, _op: string, value: unknown) => query(name, [...filters, [field, value]]),
    doc: (id: string) => ({ kind: "doc" as const, name, id, path: `${name}/${id}` }),
  });
  const tx = {
    get: vi.fn(async (ref: ReturnType<typeof query> | { kind: "doc"; name: string; id: string }) => {
      const rows = tables[ref.name] ?? [];
      if (ref.kind === "doc") {
        const row = rows.find((r) => r.id === ref.id);
        return { exists: !!row, data: () => row?.data };
      }
      const docs = rows
        .filter((r) => ref.filters.every(([f, v]) => r.data[f] === v))
        .map((r) => ({ id: r.id, data: () => r.data }));
      return { docs };
    }),
    create: vi.fn((ref: { path: string }, data: Record<string, unknown>) => writes.push({ op: "create", path: ref.path, data })),
    update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => writes.push({ op: "update", path: ref.path, data })),
  };
  const db = {
    collection: (name: string) => query(name),
    runTransaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  };
  return { db: db as unknown as Firestore, writes };
}

const pair = { instructorId: "t1", userId: "u1" };
const bookingRow = (id: string, data: Record<string, unknown>): Row => ({
  id,
  data: { instructorId: "t1", userId: "u1", userName: "Anna", userEmail: "a@x", userPhone: "1", finalPrice: 50, ...data },
});

describe("syncClientRoster", () => {
  it("creates clients/t1_u1 with timestamps on the first booking, reading only this pair's bookings", async () => {
    const { db, writes } = fakeDb({
      bookings: [bookingRow("b1", { status: "requested" }), { id: "b2", data: { instructorId: "t2", userId: "u1" } }],
      clients: [],
    });
    const result = await syncClientRoster(db, pair);
    expect(result?.kind).toBe("create");
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("create");
    expect(writes[0].path).toBe("clients/t1_u1");
    expect(writes[0].data).toMatchObject({ providerId: "t1", userId: "u1", name: "Anna", totalBookings: 1 });
    expect(writes[0].data).toHaveProperty("createdAt");
    expect(writes[0].data).toHaveProperty("updatedAt");
  });

  it("updates the existing seeded doc in place instead of creating a duplicate", async () => {
    const { db, writes } = fakeDb({
      bookings: [bookingRow("b1", { status: "payment_confirmed" })],
      clients: [{ id: "demo-client-customer", data: { providerId: "t1", userId: "u1", name: "Anna", totalBookings: 0 } }],
    });
    await syncClientRoster(db, pair);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: "update", path: "clients/demo-client-customer" });
    expect(writes[0].data).toMatchObject({ totalBookings: 1, totalSpent: 50 });
    expect(writes[0].data).not.toHaveProperty("createdAt");
  });

  it("writes nothing when the doc is already up to date", async () => {
    const { db, writes } = fakeDb({ bookings: [bookingRow("b1", { status: "requested" })], clients: [] });
    const first = await syncClientRoster(db, pair);
    const { db: db2, writes: writes2 } = fakeDb({
      bookings: [bookingRow("b1", { status: "requested" })],
      clients: [{ id: first!.id, data: first!.data }],
    });
    expect(writes).toHaveLength(1);
    expect(await syncClientRoster(db2, pair)).toBeNull();
    expect(writes2).toHaveLength(0);
  });
});
