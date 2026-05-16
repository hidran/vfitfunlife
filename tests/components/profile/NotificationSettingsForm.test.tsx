import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { defaultNotificationSettings } from '@/types/profile';

const mockMutate = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/profile-mutations', () => ({
  useUpdateNotificationSettings: () => ({ mutate: mockMutate, mutateAsync: mockMutate, isPending: false }),
}));

function wrap(ui: React.ReactNode) { return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>; }

describe('NotificationSettingsForm', () => {
  it('renders 3 channel groups', () => {
    render(wrap(<NotificationSettingsForm initial={defaultNotificationSettings} />));
    expect(screen.getByText(/push/i)).toBeInTheDocument();
    expect(screen.getByText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/sms/i)).toBeInTheDocument();
  });

  it('saves toggled state on submit', async () => {
    render(wrap(<NotificationSettingsForm initial={defaultNotificationSettings} />));
    const promoToggle = screen.getByLabelText(/push.*(promotion|promozioni)/i);
    fireEvent.click(promoToggle);
    fireEvent.click(screen.getByRole('button', { name: /save|salva/i }));
    await vi.waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({
        push: expect.objectContaining({ promotion: true }),
      }));
    });
  });
});
