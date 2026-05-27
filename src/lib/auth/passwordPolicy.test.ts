import { describe, it, expect } from 'vitest';
import { validatePasswordStrength, PASSWORD_MIN_LENGTH } from './passwordPolicy';

describe('validatePasswordStrength', () => {
  it('accepts a 12+ char password with all classes', () => {
    const r = validatePasswordStrength('Str0ng!Passw0rd');
    expect(r.valid).toBe(true);
    expect(r.rules.every((x) => x.met)).toBe(true);
  });
  it('rejects < 12 chars', () => {
    const r = validatePasswordStrength('Short1!aA');
    expect(r.valid).toBe(false);
    expect(r.rules.find((x) => x.id === 'minLength')?.met).toBe(false);
  });
  it('requires a lowercase letter', () => {
    expect(validatePasswordStrength('ALLUPPER123!ABCDE').rules.find((x) => x.id === 'lowercase')?.met).toBe(false);
  });
  it('requires an uppercase letter', () => {
    expect(validatePasswordStrength('alllower123!abcde').rules.find((x) => x.id === 'uppercase')?.met).toBe(false);
  });
  it('requires a number', () => {
    expect(validatePasswordStrength('NoNumbersHere!!aaAA').rules.find((x) => x.id === 'number')?.met).toBe(false);
  });
  it('requires a symbol', () => {
    expect(validatePasswordStrength('NoSymbols12aaAAbbCC').rules.find((x) => x.id === 'symbol')?.met).toBe(false);
  });
  it('treats exactly 12 valid chars as long enough', () => {
    expect(validatePasswordStrength('Abcdef1!ghiJ').rules.find((x) => x.id === 'minLength')?.met).toBe(true);
  });
  it('returns rules in a stable order', () => {
    expect(validatePasswordStrength('x').rules.map((x) => x.id)).toEqual(['minLength', 'lowercase', 'uppercase', 'number', 'symbol']);
  });
  it('exposes the min length constant', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });
});
