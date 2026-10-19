// Keep identical to functions/src/providers/vatNumber.ts (the web app and Cloud Functions share no package).

/** Strips all whitespace and one optional leading IT/it country prefix. */
export function normalizeVatNumber(input: string): string {
  return input.replace(/\s+/g, '').replace(/^it/i, '');
}

/**
 * True for a well-formed Italian partita IVA: 11 digits whose last digit is the
 * check digit of the first ten (odd positions as-is, even positions doubled with
 * 9 subtracted when above 9). The all-zero string passes the checksum but is not
 * a real number, so it is rejected explicitly.
 */
export function isValidItalianVat(input: string): boolean {
  const vat = normalizeVatNumber(input);
  if (!/^\d{11}$/.test(vat) || /^0{11}$/.test(vat)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = Number(vat[i]);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  return (10 - (sum % 10)) % 10 === Number(vat[10]);
}
