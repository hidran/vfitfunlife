export interface BookingInvoiceRow {
  label: string;
  value: string;
}

export interface BookingInvoiceDocument {
  language: string;
  title: string;
  reference: string;
  disclaimer: string;
  printLabel: string;
  rows: ReadonlyArray<BookingInvoiceRow>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

/** Build a printable, standalone booking record (not a fiscal invoice). */
export function createBookingInvoiceHtml(invoice: BookingInvoiceDocument): string {
  const rows = invoice.rows
    .map(({ label, value }) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="${escapeHtml(invoice.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(invoice.title)} — ${escapeHtml(invoice.reference)}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211c; }
    body { margin: 0; padding: 32px 16px; background: #f3f6f4; }
    main { max-width: 720px; margin: 0 auto; padding: 40px; background: #fff; border: 1px solid #dce5df; border-radius: 16px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .reference { color: #526159; font-size: 14px; overflow-wrap: anywhere; }
    .disclaimer { margin: 24px 0; padding: 12px 14px; background: #f3f6f4; border-radius: 8px; color: #526159; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 14px 0; border-bottom: 1px solid #e5ebe7; text-align: left; vertical-align: top; }
    th { width: 42%; color: #526159; font-weight: 500; }
    td { overflow-wrap: anywhere; }
    .print-action { margin-top: 24px; padding: 11px 18px; border: 0; border-radius: 8px; background: #087b45; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    @media print { body { padding: 0; background: #fff; } main { max-width: none; padding: 0; border: 0; border-radius: 0; } .print-action { display: none; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(invoice.title)}</h1>
    <p class="reference">${escapeHtml(invoice.reference)}</p>
    <p class="disclaimer">${escapeHtml(invoice.disclaimer)}</p>
    <table><tbody>${rows}</tbody></table>
    <button class="print-action" type="button" onclick="window.print()">${escapeHtml(invoice.printLabel)}</button>
  </main>
</body>
</html>`;
}

/** Download the standalone HTML record; it can also be printed or saved as PDF in a browser. */
export function downloadBookingInvoice(html: string, bookingId: string): void {
  const safeId = bookingId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'booking';
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vfit-booking-${safeId}.html`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
