'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Copy, Check, X, LogIn, Home, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUserGamification } from '@/hooks/useUserGamification';
import { useI18n } from '@/hooks/useI18n';
import {
  createFamily,
  joinFamily,
  leaveFamily,
  getMyFamily,
} from '@/lib/firebase/functions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Panel = 'none' | 'create' | 'join' | 'leave';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available — the code is on screen to copy by hand
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-inverse"
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {copied ? t('profile.family.inviteCodeCopied') : t('profile.family.copyInviteCode')}
    </button>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-medium text-text-inverse">{title}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.cancel')}
        className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:text-text-inverse"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

const inputClass =
  'w-full min-h-11 rounded-lg border border-hairline bg-surface-input px-3 py-2 text-base text-text-inverse placeholder:text-text-tertiary outline-none focus:border-vfit-primary/50';

export function FamilyCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const gamification = useUserGamification();

  const familyId = user?.familyId ?? null;
  const isCreator = user?.familyRole === 'creator';
  const familyQuery = useQuery({
    queryKey: ['myFamily', familyId],
    queryFn: getMyFamily,
    enabled: !!familyId,
  });
  const family = familyId ? familyQuery.data?.family ?? null : null;

  const [panel, setPanel] = useState<Panel>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const openPanel = (next: Panel) => {
    setPanel(next);
    setErrorMsg(null);
  };

  // Each action changes users/{uid}.familyId; reload() re-reads the user doc,
  // which re-keys the family query above.
  const run = useCallback(
    async (action: () => Promise<unknown>, after?: () => void) => {
      setIsSubmitting(true);
      setErrorMsg(null);
      try {
        await action();
        after?.();
        setPanel('none');
        await gamification.reload();
      } catch (err: unknown) {
        setErrorMsg(errorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [gamification],
  );

  const handleCreate = () =>
    run(
      () => createFamily({ name: createName.trim() }),
      () => {
        setCreateName('');
        setJustCreated(true);
      },
    );
  const handleJoin = () =>
    run(() => joinFamily({ inviteCode: joinCode.trim().toUpperCase() }), () => setJoinCode(''));
  const handleLeave = () => run(() => leaveFamily(), () => setJustCreated(false));

  const isLoadingFamily = !!familyId && familyQuery.isLoading;

  return (
    <section
      aria-labelledby="family-card-title"
      className={cn(
        'rounded-2xl border border-hairline bg-surface bg-gradient-to-br from-success-DEFAULT/10 to-transparent p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-DEFAULT/15" aria-hidden>
          <Users size={18} className="text-success-DEFAULT" />
        </span>
        <div className="min-w-0">
          <h2 id="family-card-title" className="text-sm font-semibold text-text-inverse">
            {t('profile.family.title')}
          </h2>
          <p className="text-xs text-text-tertiary">{t('profile.family.subtitle')}</p>
        </div>
      </div>

      <div className="mt-3">
        {isLoadingFamily ? (
          <div className="flex items-center gap-2 py-2 text-xs text-text-tertiary">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {t('common.loading')}
          </div>
        ) : family ? (
          <div className="space-y-2">
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 p-3',
                justCreated && 'border-success-DEFAULT/40',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-DEFAULT/15 text-sm font-bold text-success-DEFAULT" aria-hidden>
                {family.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-inverse">{family.name}</p>
                <p className="text-xs text-text-tertiary">
                  {family.memberCount} {t('profile.family.memberCount')} ·{' '}
                  {isCreator ? t('profile.family.roleCreator') : t('profile.family.roleMember')}
                </p>
              </div>
              {justCreated && (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-success-DEFAULT/20 px-2 py-0.5 text-[11px] font-semibold text-success-DEFAULT">
                  +300 XP
                </span>
              )}
            </div>

            {family.inviteCode && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 py-1 pl-3 pr-1">
                <div className="min-w-0">
                  <p className="text-[11px] text-text-tertiary">{t('profile.family.inviteCodeLabel')}</p>
                  <p className="truncate font-mono text-sm font-semibold tracking-widest text-text-inverse">
                    {family.inviteCode}
                  </p>
                </div>
                <CopyButton text={family.inviteCode} />
              </div>
            )}

            {/* The creator can't leave until ownership transfer exists (P1). */}
            {!isCreator && panel !== 'leave' && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center gap-1.5 text-xs text-text-secondary"
                onClick={() => openPanel('leave')}
              >
                <X size={14} aria-hidden />
                {t('profile.family.leaveButton')}
              </Button>
            )}
          </div>
        ) : (
          panel === 'none' && (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">{t('profile.family.emptyHint')}</p>
              <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="justify-center gap-1.5 whitespace-nowrap px-3 text-xs"
                  onClick={() => openPanel('create')}
                >
                  <Home size={14} aria-hidden />
                  {t('profile.family.createButton')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-center gap-1.5 whitespace-nowrap px-3 text-xs"
                  onClick={() => openPanel('join')}
                >
                  <LogIn size={14} aria-hidden />
                  {t('profile.family.joinButton')}
                </Button>
              </div>
            </div>
          )
        )}
      </div>

      {panel === 'create' && (
        <div className="mt-3 space-y-3 rounded-xl border border-hairline bg-surface-2 p-3">
          <PanelHeader title={t('profile.family.createButton')} onClose={() => openPanel('none')} />
          <label className="block">
            <span className="sr-only">{t('profile.family.createNameLabel')}</span>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t('profile.family.createNamePlaceholder')}
              maxLength={60}
              className={inputClass}
            />
          </label>
          {errorMsg && <p role="alert" className="text-xs text-error-DEFAULT">{errorMsg}</p>}
          <Button
            variant="primary"
            size="sm"
            className="w-full justify-center text-sm"
            disabled={!createName.trim() || isSubmitting}
            isLoading={isSubmitting}
            onClick={handleCreate}
          >
            {t('profile.family.createButton')}
          </Button>
        </div>
      )}

      {panel === 'join' && (
        <div className="mt-3 space-y-3 rounded-xl border border-hairline bg-surface-2 p-3">
          <PanelHeader title={t('profile.family.joinButton')} onClose={() => openPanel('none')} />
          <label className="block">
            <span className="sr-only">{t('profile.family.joinCodeLabel')}</span>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder={t('profile.family.joinCodePlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              className={cn(inputClass, 'font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal')}
            />
          </label>
          {errorMsg && <p role="alert" className="text-xs text-error-DEFAULT">{errorMsg}</p>}
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center text-sm"
            disabled={!joinCode.trim() || isSubmitting}
            isLoading={isSubmitting}
            onClick={handleJoin}
          >
            {t('profile.family.joinSubmitButton')}
          </Button>
        </div>
      )}

      {panel === 'leave' && (
        <div className="mt-3 space-y-3 rounded-xl border border-error-DEFAULT/30 bg-error-DEFAULT/10 p-3">
          <p className="text-sm font-medium text-error-DEFAULT">{t('profile.family.leaveConfirmTitle')}</p>
          <p className="text-xs text-text-secondary">{t('profile.family.leaveConfirmMessage')}</p>
          {errorMsg && <p role="alert" className="text-xs text-error-DEFAULT">{errorMsg}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" className="justify-center text-xs" onClick={() => openPanel('none')}>
              {t('profile.family.leaveConfirmCancel')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-center bg-error-DEFAULT text-xs text-white hover:bg-error-DEFAULT/90"
              disabled={isSubmitting}
              isLoading={isSubmitting}
              onClick={handleLeave}
            >
              {t('profile.family.leaveConfirmConfirm')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
