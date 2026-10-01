import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentSettingsPanel } from './PaymentSettingsPanel';

vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: 'it' }) }));

const success = vi.fn();
vi.mock('@/lib/notify', () => ({ notify: { success: (m: string) => success(m), error: vi.fn() } }));

const setPaymentSettings = vi.fn();
vi.mock('@/lib/firebase/functions', () => ({
  setPaymentSettings: (data: unknown) => setPaymentSettings(data),
}));

vi.mock('@/hooks/usePaymentSettings', () => ({
  usePaymentSettings: () => ({
    settings: { stripePaymentsEnabled: false, subscriptionsEnabled: false },
    isLoading: false,
  }),
}));

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PaymentSettingsPanel />
    </QueryClientProvider>
  );
}

describe('PaymentSettingsPanel', () => {
  beforeEach(() => {
    success.mockReset();
    setPaymentSettings.mockReset();
  });

  it('announces both toggles as switches with their state', () => {
    renderPanel();
    const stripe = screen.getByRole('switch', { name: 'admin.settings.paymentSwitches.stripe.label' });
    const subs = screen.getByRole('switch', { name: 'admin.settings.paymentSwitches.subscriptions.label' });
    expect(stripe).toHaveAttribute('aria-checked', 'false');
    expect(subs).toHaveAttribute('aria-checked', 'false');
    expect(subs).toBeDisabled();

    fireEvent.click(stripe);
    expect(stripe).toHaveAttribute('aria-checked', 'true');
    expect(subs).toBeEnabled();
  });

  it('shows a success message after a save', async () => {
    setPaymentSettings.mockResolvedValue({
      success: true,
      stripePaymentsEnabled: true,
      subscriptionsEnabled: false,
    });
    renderPanel();
    fireEvent.click(screen.getByRole('switch', { name: 'admin.settings.paymentSwitches.stripe.label' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(success).toHaveBeenCalledWith('admin.settings.savedSuccess'));
    expect(setPaymentSettings).toHaveBeenCalledWith({
      stripePaymentsEnabled: true,
      subscriptionsEnabled: false,
    });
  });

  it('shows no success message when the save fails', async () => {
    setPaymentSettings.mockRejectedValue(new Error('nope'));
    renderPanel();
    fireEvent.click(screen.getByRole('switch', { name: 'admin.settings.paymentSwitches.stripe.label' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('admin.settings.paymentSwitches.saveError')).toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });
});
