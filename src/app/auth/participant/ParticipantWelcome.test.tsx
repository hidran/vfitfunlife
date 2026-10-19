import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ParticipantWelcome } from './ParticipantWelcome';
const reset = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('email=anna%40example.com') }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ resetPassword: reset }) }));
describe('invited participant registration', () => {
  it('prefills the recipient and sends password setup privately to their email', async () => {
    render(<ParticipantWelcome />);
    expect(screen.getByLabelText('courses.participantEmail')).toHaveValue('anna@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'courses.finishRegistration' }));
    expect(await screen.findByRole('status')).toHaveTextContent('courses.checkSetupEmail');
    expect(reset).toHaveBeenCalledWith('anna@example.com');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/auth/login');
  });
});
