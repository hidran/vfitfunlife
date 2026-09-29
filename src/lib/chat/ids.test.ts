import { describe, it, expect } from 'vitest';
import { conversationIdFor, otherParticipant, sortedParticipants } from './ids';

describe('conversationIdFor', () => {
  it('is independent of argument order', () => {
    expect(conversationIdFor('bob', 'alice')).toBe('alice_bob');
    expect(conversationIdFor('alice', 'bob')).toBe('alice_bob');
  });

  it('sorts by code unit, like the rules (uppercase before lowercase)', () => {
    expect(sortedParticipants('abc', 'ABC')).toEqual(['ABC', 'abc']);
    expect(conversationIdFor('zZ9', 'Zz9')).toBe('Zz9_zZ9');
  });
});

describe('otherParticipant', () => {
  it('returns the other uid', () => {
    expect(otherParticipant('alice_bob', 'alice')).toBe('bob');
    expect(otherParticipant('alice_bob', 'bob')).toBe('alice');
  });

  it('returns null for a non-participant or a malformed id', () => {
    expect(otherParticipant('alice_bob', 'carol')).toBeNull();
    expect(otherParticipant('alicebob', 'alice')).toBeNull();
  });
});
