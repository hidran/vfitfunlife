import { describe, it, expect } from "vitest";
import { isValidItalianVat, normalizeVatNumber } from "./vatNumber";

const VALID_NUMBERS = ["12345678903", "00743110157", "01114601006"];

const INVALID_NUMBERS = [
  "1234567890", // 10 digits
  "123456789030", // 12 digits
  "1234567890A", // non-digit
  "12345678904", // bad check digit
  "00000000000", // all zeros
  "",
];

// Independent reference: Luhn-style check digit computed over the first 10 digits.
function referenceCheckDigit(first10: string): number {
  const digits = first10.split("").map(Number);
  const sum = digits.reduce((acc, d, i) => {
    if (i % 2 === 0) return acc + d;
    const doubled = d * 2;
    return acc + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return (10 - (sum % 10)) % 10;
}

describe("normalizeVatNumber", () => {
  it("trims, strips whitespace and the IT prefix", () => {
    expect(normalizeVatNumber("  it 123 456 789 03 ")).toBe("12345678903");
    expect(normalizeVatNumber("IT12345678903")).toBe("12345678903");
    expect(normalizeVatNumber("12345678903")).toBe("12345678903");
  });
});

describe("isValidItalianVat", () => {
  it.each(VALID_NUMBERS)("accepts %s", (n) => {
    expect(isValidItalianVat(n)).toBe(true);
  });

  it.each(INVALID_NUMBERS)("rejects %j", (n) => {
    expect(isValidItalianVat(n)).toBe(false);
  });

  it("accepts IT prefix and whitespace", () => {
    expect(isValidItalianVat("IT12345678903")).toBe(true);
    expect(isValidItalianVat("  it 123 456 789 03 ")).toBe(true);
  });

  it("agrees with the reference check digit for every valid fixture", () => {
    for (const n of VALID_NUMBERS) {
      expect(referenceCheckDigit(n.slice(0, 10))).toBe(Number(n[10]));
    }
  });

  it("agrees with the reference for generated numbers", () => {
    for (let i = 1; i < 200; i++) {
      const first10 = String(i * 7919).padStart(10, "0");
      const full = first10 + referenceCheckDigit(first10);
      expect(isValidItalianVat(full)).toBe(true);
      expect(isValidItalianVat(first10 + ((referenceCheckDigit(first10) + 1) % 10))).toBe(false);
    }
  });
});
