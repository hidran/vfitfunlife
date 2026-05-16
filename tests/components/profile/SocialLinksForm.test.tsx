import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SocialLinksForm } from '@/components/profile/SocialLinksForm';

vi.mock('@/lib/profile-mutations', () => ({
  useUpdateSocialLinks: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  }),
}));

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe('SocialLinksForm', () => {
  it('renders inputs for all 6 platforms', () => {
    render(wrap(<SocialLinksForm initial={{}} />));
    expect(screen.getByLabelText(/instagram/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/facebook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/twitter|x/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/linkedin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiktok/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
  });

  it('shows validation error for malformed instagram URL', async () => {
    render(wrap(<SocialLinksForm initial={{}} />));
    fireEvent.change(screen.getByLabelText(/instagram/i), { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByRole('button', { name: /save|salva/i }));
    await waitFor(() => expect(screen.getByText(/Invalid Instagram URL/i)).toBeInTheDocument());
  });
});
