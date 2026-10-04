export function normalizeVatNumber(input: string): string {
  return input.replace(/\s+/g, '').replace(/^it/i, '');
}

export function isValidItalianVat(input: string): boolean {
  const vat = normalizeVatNumber(input);
  if (!/^\d{11}$/.test(vat) || /^0+$/.test(vat)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(vat[i]);
    if (i % 2 === 0) {
      sum += d;
    } else {
      const doubled = d * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  return (10 - (sum % 10)) % 10 === Number(vat[10]);
}
