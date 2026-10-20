'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { courseCall } from '@/lib/firebase/courses';
export function ParticipantInvitation({ courseId, userId }: { courseId: string; userId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [links, setLinks] = useState<{ smsUrl: string; whatsAppUrl?: string | null } | null>(null);
  async function notify(channel: 'email' | 'phone') {
    setBusy(true); setStatus(''); setLinks(null);
    try {
      const result = await courseCall<{ status: string; smsUrl: string; whatsAppUrl?: string | null }>('notifyCourseParticipant', { courseId, userId, channel });
      if (result.status === 'ready') { setLinks(result); setStatus(t('courses.phoneInviteHint')); }
      else setStatus(t(result.status === 'sent' ? 'courses.invitationSent' : 'courses.invitationFailed'));
    } catch (error) {
      setStatus(t((error as { message?: string })?.message === 'phone_required' ? 'courses.phoneRequired' : 'courses.invitationFailed'));
    } finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => notify('email')}>{t('courses.inviteEmail')}</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => notify('phone')}>{t('courses.invitePhone')}</Button>
    </div>
    {status && <p role="status" className="text-sm">{status}</p>}
    {links && <div className="flex flex-wrap gap-3 text-sm font-semibold text-section-primary">
      <a href={links.smsUrl}>{t('courses.openSms')}</a>
      {links.whatsAppUrl && <a href={links.whatsAppUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
    </div>}
  </div>;
}
