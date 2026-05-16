import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvatarUploader } from '@/components/profile/AvatarUploader';

vi.mock('@/lib/profile-mutations', () => ({
  useUpdateAvatar: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn().mockResolvedValue({}),
  getDownloadURL: vi.fn().mockResolvedValue('https://firebasestorage.googleapis.com/v0/b/demo/o/avatars%2Fu1%2Fx.jpg'),
}));

function wrap(ui: React.ReactNode) { return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>; }

describe('AvatarUploader', () => {
  it('renders a file picker', () => {
    render(wrap(<AvatarUploader currentUrl={null} uid="u1" />));
    expect(screen.getByLabelText(/upload.*avatar/i)).toBeInTheDocument();
  });

  it('shows current avatar when provided', () => {
    render(wrap(<AvatarUploader currentUrl="https://example.com/a.jpg" uid="u1" />));
    expect(screen.getByRole('img', { name: /current avatar/i })).toHaveAttribute('src', 'https://example.com/a.jpg');
  });
});
