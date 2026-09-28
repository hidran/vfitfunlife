import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/firebase/config', () => ({ auth: {}, db: {}, getFunctionsInstance: vi.fn() }));
vi.mock('@/lib/firebase/functions', () => ({ cancelBooking: vi.fn(), decideProviderApplication: vi.fn() }));

import {
  adminIndexPatch,
  computeAdminIndex,
  computeSearchTokens,
  normalizeSearchQuery,
  SEARCH_TOKENS_CAP,
} from './adminIndex';
import { hiddenAccountKind, providerVerificationState } from '@/lib/firebase/admin';
import { needsVerificationDecision } from '@/lib/providerVerification';

describe('adminIndex copies', () => {
  it('src/lib/admin/adminIndex.ts and functions/src/users/adminIndex.ts are byte-identical', () => {
    const root = resolve(__dirname, '../../..');
    const client = readFileSync(resolve(root, 'src/lib/admin/adminIndex.ts'), 'utf8');
    const server = readFileSync(resolve(root, 'functions/src/users/adminIndex.ts'), 'utf8');
    expect(client).toBe(server);
  });
});

/** Does searching `query` find a document carrying `record`? */
const finds = (record: Parameters<typeof computeSearchTokens>[0], query: string) =>
  computeSearchTokens(record).includes(normalizeSearchQuery(query));

describe('search tokens', () => {
  const mario = { fullName: 'Mário Rossi-Bianchi', email: 'Mario.Rossi@Example.com', phone: '+39 333 123 4567' };

  it('finds a user by any name word prefix, case- and accent-insensitively', () => {
    for (const q of ['m', 'MAR', 'mario', 'ross', 'bianchi', 'Mario Ro', 'mario rossi b']) {
      expect(finds(mario, q), q).toBe(true);
    }
    expect(finds(mario, 'ossi')).toBe(false); // prefixes only, not substrings
  });

  it('finds a user by email prefix, whole email and local-part word', () => {
    for (const q of ['mario.rossi@', 'mario.rossi@example.com', 'rossi', 'MARIO.R']) {
      expect(finds(mario, q), q).toBe(true);
    }
  });

  it('finds a user by phone with or without the +39 prefix and any spacing', () => {
    for (const q of ['333', '333 123', '+39 333 1234567', '39333', '0039 333 12']) {
      expect(finds(mario, q), q).toBe(true);
    }
    expect(finds(mario, '444')).toBe(false);
  });

  it('truncates long queries to the stored prefix length', () => {
    const long = { email: 'averyveryverylongaddress@example.com' };
    expect(finds(long, 'averyveryverylongaddress@example.com')).toBe(true);
  });

  it('normalizes an empty or punctuation-only query to nothing', () => {
    expect(normalizeSearchQuery('   ')).toBe('');
    expect(normalizeSearchQuery(' -- ')).toBe('');
  });

  it('caps the token count', () => {
    const huge = { fullName: Array.from({ length: 60 }, (_, i) => `word${i}abcdefghijkl`).join(' ') };
    expect(computeSearchTokens(huge).length).toBeLessThanOrEqual(SEARCH_TOKENS_CAP);
  });
});

describe('derived fields agree with the predicates the admin UI uses', () => {
  const records: [string, Record<string, unknown>][] = [
    ['plain', { role: 'customer' }],
    ['applicant', { role: 'customer', providerStatus: 'pending' }],
    ['rejectedApplicant', { role: 'customer', providerStatus: 'rejected' }],
    ['rejectedProvider', { role: 'provider', providerStatus: 'rejected', providerProfile: { isVerified: true } }],
    ['unverifiedPro', { role: 'provider' }],
    ['verifiedPro', { role: 'provider', providerStatus: 'verified', providerProfile: { isVerified: true } }],
    ['legacyPro', { role: 'provider', isVerified: true }],
    ['pendingPro', { role: 'provider', providerStatus: 'pending', providerProfile: { isVerified: true } }],
    ['deleted', { role: 'customer', isDeleted: true }],
    ['deletedAt', { role: 'customer', deletedAt: new Date() }],
    ['demoEmail', { email: 'x@DEMO.vfit' }],
    ['provider_12', { role: 'provider' }],
    ['customer_3', { role: 'customer' }],
  ];

  it.each(records)('%s', (id, data) => {
    const derived = computeAdminIndex(id, data);
    expect(derived.adminHidden).toBe(hiddenAccountKind(id, data) !== null);
    const listed = data.role === 'provider' || ['pending', 'rejected'].includes(data.providerStatus as string);
    expect(derived.providerVerification).toBe(listed ? providerVerificationState(data) : null);
    // The providers list's "pending" filter and the verification queue count the same people.
    expect(derived.providerVerification === 'pending').toBe(needsVerificationDecision(data));
  });
});

describe('adminIndexPatch', () => {
  it('is null once the document carries its derived fields', () => {
    const data = { fullName: 'A B', role: 'provider' };
    expect(adminIndexPatch('u', { ...data, ...computeAdminIndex('u', data) })).toBeNull();
  });

  it('writes providerVerification: null explicitly for non-providers', () => {
    expect(adminIndexPatch('u', { role: 'customer' })).toMatchObject({ providerVerification: null });
  });
});
