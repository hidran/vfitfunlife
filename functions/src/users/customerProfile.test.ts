import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ACCOUNT_STATUS_INVITED,
  CUSTOMER_DEFAULT_PERMISSIONS,
  buildInvitedCustomerProfile,
  isInvitedAccountClaimed,
} from "./customerProfile";

/**
 * The new-user object completeRegistration writes (src/lib/firebase/auth.ts), read from the
 * client source so a change on either side fails here instead of silently diverging.
 */
function registrationShape(): { keys: string[]; permissions: string[] } {
  const src = readFileSync(resolve(__dirname, "../../../src/lib/firebase/auth.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function completeRegistration("));
  const start = fn.indexOf("await setDoc(userRef, {");
  const block = fn.slice(start, fn.indexOf("\n    });", start));
  // "key: value" or shorthand "key,"
  const keys = [...block.matchAll(/^\s{6}(\w+)[:,]/gm)].map((m) => m[1]);
  const permBlock = block.slice(block.indexOf("permissions: ["), block.indexOf("],", block.indexOf("permissions: [")));
  const permissions = [...permBlock.matchAll(/"([a-z]+:[a-z]+)"/g)].map((m) => m[1]);
  return { keys, permissions };
}

const TS = { sentinel: "serverTimestamp" };

const profile = buildInvitedCustomerProfile({
  uid: "u1",
  email: "luca@example.com",
  fullName: "Luca Rossi",
  phone: "+393331234567",
  preferredLanguage: "en",
  createdBy: "trainer1",
}, TS);

describe("buildInvitedCustomerProfile", () => {
  it("has exactly the registration keys plus createdBy and accountStatus", () => {
    const { keys } = registrationShape();
    expect(keys.length).toBeGreaterThan(10);
    expect(Object.keys(profile).sort()).toEqual([...keys, "createdBy", "accountStatus"].sort());
  });

  it("grants the same permissions as self-registration", () => {
    const { permissions } = registrationShape();
    expect(permissions.length).toBeGreaterThan(0);
    expect(profile.permissions).toEqual(permissions);
    expect(CUSTOMER_DEFAULT_PERMISSIONS).toEqual(permissions);
  });

  it("fills the invited-customer values", () => {
    expect(profile).toMatchObject({
      uid: "u1",
      email: "luca@example.com",
      fullName: "Luca Rossi",
      phone: "+393331234567",
      dateOfBirth: null,
      preferredSection: "fit",
      role: "customer",
      isActive: true,
      isSuspended: false,
      isVerified: false,
      isVip: false,
      pointsBalance: 100,
      walletBalance: 0,
      preferredLanguage: "en",
      createdAt: TS,
      updatedAt: TS,
      lastLoginAt: null,
      createdBy: "trainer1",
      accountStatus: ACCOUNT_STATUS_INVITED,
    });
  });

  it("does not share the permissions array between profiles", () => {
    expect(profile.permissions).not.toBe(CUSTOMER_DEFAULT_PERMISSIONS);
  });
});

describe("isInvitedAccountClaimed", () => {
  it("is false for the credential-less account as created", () => {
    expect(isInvitedAccountClaimed({ emailVerified: false, providerData: [] })).toBe(false);
    expect(isInvitedAccountClaimed({})).toBe(false);
  });
  it("is true once a password or Google is on the record, or the email is verified", () => {
    expect(isInvitedAccountClaimed({ providerData: [{ providerId: "password" }] })).toBe(true);
    expect(isInvitedAccountClaimed({ providerData: [{ providerId: "google.com" }] })).toBe(true);
    expect(isInvitedAccountClaimed({ emailVerified: true, providerData: [] })).toBe(true);
  });
});
