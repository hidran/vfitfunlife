'use client';

import { useState, useCallback } from 'react';
import { Users, Copy, X, ChevronRight, Home } from 'lucide-react';
import { useUserGamification } from '@/hooks/useUserGamification';
import { useI18n } from '@/hooks/useI18n';
import {
  createFamily,
  joinFamily,
  leaveFamily,
  getMyFamily,
} from '@/lib/firebase/functions';
import { cn } from '@/lib/utils';
import type { MessageKey } from '@/i18n/messages';
import { Button } from '@/components/ui/button';

type FamilyAction = 'idle' | 'loading' | 'created' | 'joined' | 'left' | 'error';

interface FamilyData {
  id: string;
  name: string;
  inviteCode: string | null;
  memberCount: number;
  createdBy: string;
  creatorName: string;
  creatorAvatar: string | null;
  createdAt: string | null;
  settings: {
    allowTransfers: boolean;
    maxMembers: number;
  } | null;
}

function CopyButton({ text, labelCopied, labelCopy }: { text: string; labelCopied: string; labelCopy: string }) {
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState(labelCopy);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setLabel(labelCopied);
      setTimeout(() => {
        setCopied(false);
        setLabel(labelCopy);
      }, 2000);
    } catch {
      // clipboard API not available — no-op
    }
  }, [text, labelCopied, labelCopy]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-inverse transition-colors"
    >
      <Copy size={12} />
      {label}
    </button>
  );
}

export function FamilyCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const gamification = useUserGamification();

  const [actionState, setActionState] = useState<FamilyAction>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [family, setFamily] = useState<FamilyData | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const loadFamily = useCallback(async () => {
    try {
      const result = await getMyFamily();
      setFamily(result.family);
    } catch {
      setFamily(null);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) return;
    setActionState('loading');
    setErrorMsg(null);
    try {
      const result = await createFamily({ name: createName.trim() });
      setFamily({
        id: result.familyId,
        name: result.name,
        inviteCode: result.inviteCode,
        memberCount: result.memberCount,
        createdBy: '',
        creatorName: '',
        creatorAvatar: null,
        createdAt: null,
        settings: { allowTransfers: true, maxMembers: 8 },
      });
      setShowCreate(false);
      setCreateName('');
      setActionState('created');
      await gamification.reload();
      await loadFamily();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'Creazione famiglia fallita';
      setErrorMsg(message);
      setActionState('error');
    }
  }, [createName, gamification, loadFamily]);

  const handleJoin = useCallback(async () => {
    if (!joinCode.trim()) return;
    setActionState('loading');
    setErrorMsg(null);
    try {
      await joinFamily({ inviteCode: joinCode.trim() });
      setShowJoin(false);
      setJoinCode('');
      setActionState('joined');
      await gamification.reload();
      await loadFamily();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'Invito non valido';
      setErrorMsg(message);
      setActionState('error');
    }
  }, [joinCode, gamification, loadFamily]);

  const handleLeave = useCallback(async () => {
    setActionState('loading');
    setErrorMsg(null);
    try {
      await leaveFamily();
      setFamily(null);
      setShowLeaveConfirm(false);
      setActionState('left');
      await gamification.reload();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'Impossibile uscire dalla famiglia';
      setErrorMsg(message);
      setActionState('error');
    }
  }, [gamification]);

  // Initial load after hook is seeded.
  const needsFamilyLoad =
    gamification.isSeeded && family === null && actionState === 'idle' && !showCreate && !showJoin && !showLeaveConfirm;
  if (needsFamilyLoad) {
    // Defer one render cycle to let the hook settle.
    return (
      <div className={cn('rounded-2xl border border-hairline bg-surface-2/60 p-4', className)}>
        <div className="flex items-center gap-2 text-text-tertiary">
          <Home size={16} className="animate-pulse" />
          <span className="text-xs">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  const hasFamily = family !== null;

  return (
    <div
      className={cn(
        'rounded-2xl border border-hairline bg-gradient-to-br from-[#15241e] to-[#0f1a15] p-4',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-gradient-to-br from-success-DEFAULT/30 to-success-DEFAULT/10 p-2">
            <Users size={18} className="text-success-DEFAULT" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-inverse">
              {t('profile.family.title')}
            </p>
            <p className="text-[10px] text-text-tertiary">
              {t('profile.family.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Family card or empty state */}
      {hasFamily ? (
        <div className="space-y-3">
          <div
            className={cn(
              'flex items-center justify-between rounded-xl border border-hairline bg-surface-2/40 p-3',
              actionState === 'created' && 'border-success-DEFAULT/40',
              actionState === 'joined' && 'border-info-DEFAULT/40',
              actionState === 'left' && 'border-warning-DEFAULT/40',
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-success-DEFAULT/20 to-success-DEFAULT/5 text-success-DEFAULT font-bold text-sm">
                {family.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-inverse">{family.name}</p>
                <p className="text-[10px] text-text-tertiary">
                  {family.memberCount} {t('profile.family.memberCount')} · {t('profile.family.roleMember')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {family.inviteCode && (
                <CopyButton
                  text={family.inviteCode}
                  labelCopied={t('profile.family.inviteCodeCopied')}
                  labelCopy={t('profile.family.copyInviteCode')}
                />
              )}
              {actionState === 'created' && (
                <span className="rounded-full bg-success-DEFAULT/20 px-2 py-0.5 text-[10px] font-medium text-success-DEFAULT">
                  +300 XP
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start gap-1 text-xs"
              onClick={() => setShowLeaveConfirm(true)}
            >
              <X size={14} />
              {t('profile.family.leaveButton')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-text-tertiary">{t('profile.family.emptyHint')}</p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              className="flex-1 justify-center gap-1 text-xs"
              onClick={() => setShowCreate(true)}
            >
              <Home size={14} />
              {t('profile.family.createButton')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-center gap-1 text-xs"
              onClick={() => setShowJoin(true)}
            >
              <ChevronRight size={14} className="rotate-90" />
              {t('profile.family.joinButton')}
            </Button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="mt-3 rounded-xl border border-hairline bg-surface-2/80 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-inverse">{t('profile.family.createButton')}</p>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-text-tertiary hover:text-text-inverse transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder={t('profile.family.createNamePlaceholder')}
            maxLength={60}
            className="w-full rounded-lg border border-hairline bg-surface-2/60 px-3 py-2 text-sm text-text-inverse placeholder:text-text-tertiary outline-none focus:border-vfit-primary/50"
          />
          {errorMsg && (
            <p className="text-xs text-error-DEFAULT">{errorMsg}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-center text-xs"
              onClick={() => setShowCreate(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1 justify-center text-xs"
              disabled={!createName.trim() || actionState === 'loading'}
              onClick={handleCreate}
            >
              {actionState === 'loading' ? t('common.loading') : t('profile.family.createButton')}
            </Button>
          </div>
        </div>
      )}

      {/* Join modal */}
      {showJoin && (
        <div className="mt-3 rounded-xl border border-hairline bg-surface-2/80 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-inverse">{t('profile.family.joinButton')}</p>
            <button
              type="button"
              onClick={() => setShowJoin(false)}
              className="text-text-tertiary hover:text-text-inverse transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder={t('profile.family.joinCodePlaceholder')}
            className="w-full rounded-lg border border-hairline bg-surface-2/60 px-3 py-2 text-sm text-text-inverse placeholder:text-text-tertiary uppercase outline-none focus:border-vfit-primary/50 tracking-widest"
          />
          {errorMsg && (
            <p className="text-xs text-error-DEFAULT">{errorMsg}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-center text-xs"
              onClick={() => setShowJoin(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-center text-xs"
              disabled={!joinCode.trim() || actionState === 'loading'}
              onClick={handleJoin}
            >
              {actionState === 'loading' ? t('common.loading') : t('profile.family.joinSubmitButton')}
            </Button>
          </div>
        </div>
      )}

      {/* Leave confirm modal */}
      {showLeaveConfirm && (
        <div className="mt-3 rounded-xl border border-error-DEFAULT/30 bg-error-DEFAULT/10 p-3 space-y-3">
          <p className="text-sm font-medium text-error-DEFAULT">
            {t('profile.family.leaveConfirmTitle')}
          </p>
          <p className="text-xs text-text-secondary">{t('profile.family.leaveConfirmMessage')}</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-center text-xs"
              onClick={() => setShowLeaveConfirm(false)}
            >
              {t('profile.family.leaveConfirmCancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1 justify-center text-xs bg-error-DEFAULT text-white hover:bg-error-DEFAULT/90"
              disabled={actionState === 'loading'}
              onClick={handleLeave}
            >
              {actionState === 'loading' ? t('common.loading') : t('profile.family.leaveConfirmConfirm')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
