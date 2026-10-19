import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBookingInvoiceHtml, downloadBookingInvoice } from './providerBookingInvoice';

describe('createBookingInvoiceHtml', () => {
  it('renders booking rows and escapes user-controlled content', () => {
    const html = createBookingInvoiceHtml({
      language: 'en-GB',
      title: 'Booking summary',
      reference: 'Booking ID: b-1',
      disclaimer: 'Not a fiscal invoice.',
      printLabel: 'Print / Save as PDF',
      rows: [
        { label: 'Client', value: '<img src=x onerror="alert(1)">' },
        { label: 'Total', value: '€75.00' },
      ],
    });

    expect(html).toContain('<html lang="en-GB">');
    expect(html).toContain('Booking ID: b-1');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('€75.00');
    expect(html).toContain('window.print()');
    expect(html).not.toContain('<img src=x');
  });
});

describe('downloadBookingInvoice', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts an HTML download with a filesystem-safe booking filename', () => {
    const objectUrl = 'blob:test-invoice';
    vi.useFakeTimers();
    const createObjectURL = vi.fn((_blob: Blob) => objectUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickedAnchors: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });
    const html = '<!doctype html><title>Booking summary</title>';

    downloadBookingInvoice(html, 'booking/id 1');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledOnce();
    expect(clickedAnchors[0]?.download).toBe('vfit-booking-booking_id_1.html');
    expect(clickedAnchors[0]?.href).toBe(objectUrl);
    expect(clickedAnchors[0]?.isConnected).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });
});
