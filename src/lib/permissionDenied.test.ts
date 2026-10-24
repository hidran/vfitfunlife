import { describe, expect, it } from 'vitest';
import { isPermissionDenied } from './permissionDenied';

describe('isPermissionDenied', () => {
  it('recognises the Firestore and callable codes and the SDK message', () => {
    expect(isPermissionDenied(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }))).toBe(true);
    expect(isPermissionDenied({ code: 'functions/permission-denied', message: 'venue_authorization_required' })).toBe(true);
    expect(isPermissionDenied(new Error('FirebaseError: Missing or insufficient permissions.'))).toBe(true);
  });

  it('leaves every other failure alone', () => {
    expect(isPermissionDenied(new Error('network'))).toBe(false);
    expect(isPermissionDenied({ code: 'not-found' })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied('permission-denied')).toBe(false);
  });
});
