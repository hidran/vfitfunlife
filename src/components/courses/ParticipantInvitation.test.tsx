import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParticipantInvitation } from './ParticipantInvitation';
const call = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: call }));
beforeEach(() => call.mockReset());
describe('participant invitations', () => {
  it('reports failed email delivery honestly', async () => {
    call.mockResolvedValue({ status: 'failed' });
    render(<ParticipantInvitation courseId="c" userId="u" />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.inviteEmail' }));
    expect(await screen.findByRole('status')).toHaveTextContent('courses.invitationFailed');
    expect(call).toHaveBeenCalledWith('notifyCourseParticipant', { courseId: 'c', userId: 'u', channel: 'email' });
  });
  it('opens phone composers without claiming the message was delivered', async () => {
    call.mockResolvedValue({ status: 'ready', smsUrl: 'sms:+391234?body=invite', whatsAppUrl: 'https://wa.me/391234' });
    render(<ParticipantInvitation courseId="c" userId="u" />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.invitePhone' }));
    expect(await screen.findByRole('link', { name: 'courses.openSms' })).toHaveAttribute('href', 'sms:+391234?body=invite');
    expect(screen.getByRole('status')).toHaveTextContent('courses.phoneInviteHint');
    expect(screen.queryByText('courses.invitationSent')).not.toBeInTheDocument();
  });
});
