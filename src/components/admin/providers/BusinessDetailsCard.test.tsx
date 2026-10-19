import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFetchProvider = vi.fn();
vi.mock('@/lib/firebase/providers', () => ({
  fetchProvider: (id: string) => mockFetchProvider(id),
}));

const mockReleaseBusinessVat = vi.fn();
vi.mock('@/lib/firebase/functions', () => ({
  releaseBusinessVat: (data: unknown) => mockReleaseBusinessVat(data),
}));

const mockNotify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: mockNotify }));

import { BusinessDetailsCard } from './BusinessDetailsCard';

const stored = {
  legalName: 'Palestra Rossi S.r.l.',
  vatNumber: '01234567897',
  displayName: 'Palestra Rossi',
  venueType: 'studio',
  address: 'Via Roma 1',
  city: 'Torino',
  website: 'https://palestrarossi.it',
  logoUrl: 'https://cdn.example.com/logo.png',
};

function renderCard(isVerified = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BusinessDetailsCard providerId="biz" isVerified={isVerified} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchProvider.mockResolvedValue({ id: 'biz', providerType: 'business', business: stored });
  mockReleaseBusinessVat.mockResolvedValue({
    success: true, providerId: 'biz', vatNumber: '01234567897', released: true,
  });
});

const openRelease = () => fireEvent.click(screen.getByRole('button', { name: /Libera P\.IVA/ }));

describe('BusinessDetailsCard', () => {
  it('shows the company details read from instructors/{uid}', async () => {
    renderCard();

    expect(await screen.findByText('Palestra Rossi S.r.l.')).toBeInTheDocument();
    expect(mockFetchProvider).toHaveBeenCalledWith('biz');
    expect(screen.getByText('01234567897')).toBeInTheDocument();
    expect(screen.getByText('Palestra Rossi')).toBeInTheDocument();
    expect(screen.getByText('Via Roma 1')).toBeInTheDocument();
    expect(screen.getByText('Torino')).toBeInTheDocument();
    expect(screen.getByText('Studio')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /palestrarossi\.it/ });
    expect(link).toHaveAttribute('href', 'https://palestrarossi.it/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute('src', stored.logoUrl);
  });

  it('never turns a non-http(s) website into a link', async () => {
    mockFetchProvider.mockResolvedValueOnce({
      id: 'biz',
      providerType: 'business',
      business: { ...stored, website: 'javascript:alert(1)' },
    });
    renderCard();
    await screen.findByText('Palestra Rossi S.r.l.');

    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /javascript/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('releases the P.IVA claim after a confirmation, with the reason', async () => {
    renderCard();
    await screen.findByText('Palestra Rossi S.r.l.');

    openRelease();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('01234567897');
    expect(mockReleaseBusinessVat).not.toHaveBeenCalled();

    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'Azienda chiusa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Libera' }));

    await waitFor(() =>
      expect(mockReleaseBusinessVat).toHaveBeenCalledWith({ providerId: 'biz', reason: 'Azienda chiusa' }),
    );
    await waitFor(() => expect(mockNotify.success).toHaveBeenCalledWith('P.IVA liberata'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Only the claim went: the number is still shown.
    expect(screen.getByText('01234567897')).toBeInTheDocument();
  });

  it('warns more strongly for a verified (live) company', async () => {
    const { unmount } = renderCard(false);
    await screen.findByText('Palestra Rossi S.r.l.');
    openRelease();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();

    renderCard(true);
    await screen.findByText('Palestra Rossi S.r.l.');
    openRelease();
    expect(screen.getByRole('alert')).toHaveTextContent(/già verificata/);
  });

  it('tells the admin when the claim was already free', async () => {
    mockReleaseBusinessVat.mockResolvedValueOnce({ success: true, providerId: 'biz', vatNumber: '01234567897', released: false });
    renderCard();
    await screen.findByText('Palestra Rossi S.r.l.');

    openRelease();
    fireEvent.click(screen.getByRole('button', { name: 'Libera' }));
    await waitFor(() => expect(mockNotify.success).toHaveBeenCalledWith('La P.IVA era già libera'));
    expect(mockReleaseBusinessVat).toHaveBeenCalledWith({ providerId: 'biz' });
  });

  it.each([
    [{ code: 'functions/not-found', message: 'Provider not found' }, /non trovato/],
    [{ code: 'functions/failed-precondition', message: 'business_vat_missing' }, /non ha una P\.IVA/],
    [{ code: 'functions/internal', message: 'boom' }, /Errore|errore|riprova/i],
  ])('reports a failed release (%o) and keeps the dialog open', async (error, expected) => {
    mockReleaseBusinessVat.mockRejectedValueOnce(error);
    renderCard();
    await screen.findByText('Palestra Rossi S.r.l.');

    openRelease();
    fireEvent.click(screen.getByRole('button', { name: 'Libera' }));
    await waitFor(() => expect(mockNotify.error).toHaveBeenCalledWith(expect.stringMatching(expected)));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
