'use client';

import type { User, UserRole } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';
import { formatDate, formatPrice, toDate } from '@/lib/utils';
import { defaultNotificationSettings, allFalseNotificationSettings } from '@/types/profile';
import { UserFormView, type UserFormData } from './UserFormView';
import { CalendarDays, Clock, CreditCard, History, UserCog } from 'lucide-react';

export type UserTab = 'overview' | 'bookings' | 'activity';

interface TabBarProps {
  active: UserTab;
  onChange: (tab: UserTab) => void;
}

export function UserTabBar({ active, onChange }: TabBarProps) {
  const { t } = useI18n();
  const tabs: { id: UserTab; label: string; icon: typeof UserCog }[] = [
    { id: 'overview', label: t('admin.userDetail.tab.overview'), icon: UserCog },
    { id: 'bookings', label: t('admin.userDetail.tab.bookings'), icon: CalendarDays },
    { id: 'activity', label: t('admin.userDetail.tab.activity'), icon: History },
  ];
  return (
    <div className="border-b border-hairline">
      <div className="flex gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'text-[#00C9FF] border-[#00C9FF]'
                : 'text-content-muted border-transparent hover:text-content'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ContentProps {
  user: User;
  activeTab: UserTab;
  editing: boolean;
  onSubmitForm: (data: UserFormData) => void;
  onRoleChange: (role: UserRole) => void;
}

export function UserTabContent({
  user,
  activeTab,
  editing,
  onSubmitForm,
  onRoleChange,
}: ContentProps) {
  const { t } = useI18n();

  if (activeTab === 'bookings') {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-8 text-center">
        <CalendarDays className="w-12 h-12 text-content-faint mx-auto mb-4" />
        <p className="text-content-muted">{t('admin.userDetail.bookingHistoryPlaceholder')}</p>
      </div>
    );
  }

  if (activeTab === 'activity') {
    return (
      <div className="bg-surface rounded-2xl border border-hairline p-8 text-center">
        <History className="w-12 h-12 text-content-faint mx-auto mb-4" />
        <p className="text-content-muted">{t('admin.userDetail.activityLogPlaceholder')}</p>
      </div>
    );
  }

  // overview
  const u = user as User & {
    notificationSettings?: typeof defaultNotificationSettings;
    notificationsEnabled?: boolean;
  };
  const ns =
    u.notificationSettings ??
    (u.notificationsEnabled === false
      ? allFalseNotificationSettings
      : defaultNotificationSettings);

  const notifications = [
    { label: t('admin.userDetail.notification.email'), enabled: user.emailVerified },
    {
      label: t('admin.userDetail.notification.push'),
      enabled: Object.values(ns.push).some(Boolean),
    },
    { label: t('admin.userDetail.notification.sms'), enabled: user.phoneVerified },
    {
      label: t('admin.userDetail.notification.marketing'),
      enabled: ns.email?.promotion ?? false,
    },
  ];

  return (
    <>
      {/* Account Information (form: view OR edit) */}
      <div className="bg-surface rounded-2xl border border-hairline p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-content">
            {t('admin.userDetail.accountInfo')}
          </h3>
        </div>
        <UserFormView mode={editing ? 'edit' : 'view'} initial={user} onSubmit={onSubmitForm} />
      </div>

      {/* Role selector + secondary fields + stats + wallet + notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <h3 className="text-lg font-semibold text-content mb-4">
            {t('admin.userDetail.field.role')}
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between py-2 border-b border-hairline">
              <span className="text-content-muted">
                {t('admin.userDetail.field.dateOfBirth')}
              </span>
              <span className="text-content">
                {user.dateOfBirth
                  ? formatDate(toDate(user.dateOfBirth) || new Date())
                  : t('admin.userDetail.field.notSet')}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-hairline">
              <span className="text-content-muted">{t('admin.userDetail.field.role')}</span>
              <select
                value={user.role}
                onChange={(e) => onRoleChange(e.target.value as UserRole)}
                className="bg-surface-elevated border border-hairline rounded-lg px-3 py-1 text-sm text-content"
              >
                <option value="customer">{t('admin.userDetail.field.roleCustomer')}</option>
                <option value="provider">{t('admin.userDetail.field.roleProvider')}</option>
                <option value="admin">{t('admin.userDetail.field.roleAdmin')}</option>
                <option value="superadmin">{t('admin.userDetail.field.roleSuperadmin')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <h3 className="text-lg font-semibold text-content mb-4">{t('admin.userDetail.stats')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <StatBox
              icon={<CalendarDays className="w-5 h-5 text-[#00C9FF]" />}
              label={t('admin.userDetail.stat.totalBookings')}
              value="0"
            />
            <StatBox
              icon={<CreditCard className="w-5 h-5 text-[#10B981]" />}
              label={t('admin.userDetail.stat.totalSpent')}
              value={formatPrice(0)}
            />
            <StatBox
              icon={
                <div className="w-5 h-5 rounded-full bg-gradient-to-r from-[#FFD700] to-[#FFA500] flex items-center justify-center text-[10px] font-bold text-black">
                  VIP
                </div>
              }
              label={t('admin.userDetail.stat.vipStatus')}
              value={
                user.isVip
                  ? t('admin.userDetail.stat.vipActive')
                  : t('admin.userDetail.stat.vipInactive')
              }
            />
            <StatBox
              icon={<Clock className="w-5 h-5 text-[#F59E0B]" />}
              label={t('admin.userDetail.stat.points')}
              value={(user.pointsBalance || 0).toLocaleString()}
            />
          </div>
        </div>

        {/* Wallet & Points */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <h3 className="text-lg font-semibold text-content mb-4">
            {t('admin.userDetail.walletPoints')}
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-surface-sunken rounded-xl">
              <span className="text-content-muted">{t('admin.userDetail.walletBalance')}</span>
              <span className="text-xl font-semibold text-content">
                {formatPrice(user.walletBalance || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-surface-sunken rounded-xl">
              <span className="text-content-muted">{t('admin.userDetail.pointsBalance')}</span>
              <span className="text-xl font-semibold text-content">
                {(user.pointsBalance || 0).toLocaleString()}{' '}
                {t('admin.userDetail.pointsSuffix')}
              </span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <h3 className="text-lg font-semibold text-content mb-4">
            {t('admin.userDetail.notificationSettings')}
          </h3>
          <div className="space-y-3">
            {notifications.map((setting) => (
              <div key={setting.label} className="flex justify-between items-center">
                <span className="text-content-muted">{setting.label}</span>
                <span
                  className={`text-sm ${
                    setting.enabled ? 'text-[#10B981]' : 'text-content-faint'
                  }`}
                >
                  {setting.enabled
                    ? t('admin.userDetail.notification.enabled')
                    : t('admin.userDetail.notification.disabled')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="p-4 bg-surface-sunken rounded-xl">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-content-muted">{label}</span>
      </div>
      <p className="text-2xl font-bold text-content">{value}</p>
    </div>
  );
}
