import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivacySettingsForm } from '@/components/profile/PrivacySettingsForm';
import { defaultPrivacySettings } from '@/types/profile';

const mockMutate = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/profile-mutations', () => ({
  useUpdatePrivacySettings: () => ({ mutate: mockMutate, mutateAsync: mockMutate, isPending: false }),
}));

function wrap(ui: React.ReactNode) { return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>; }

describe('PrivacySettingsForm', () => {
  it('renders visibility radio + toggles', () => {
    render(wrap(<PrivacySettingsForm initial={defaultPrivacySettings} />));
    expect(screen.getByLabelText(/^public$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/verified.*only/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^private$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/show email/i)).toBeInTheDocument();
  });

  it('submits changed visibility', async () => {
    render(wrap(<PrivacySettingsForm initial={defaultPrivacySettings} />));
    fireEvent.click(screen.getByLabelText(/^private$/i));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await vi.waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ profileVisibility: 'private' }));
    });
  });
});
