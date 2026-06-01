'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  CreditCard,
  MapPin,
  Plus,
  Save,
  Settings,
  Shield,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { type ProfileRouteSection } from '@/lib/featureRouteContent';
import { NotificationSettings as NotificationSettingsCard } from '@/components/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updatePrivacySettings, updateUserProfile } from '@/lib/firebase/auth';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import type { MessageKey } from '@/i18n/messages';
import type { NotificationSettings, PrivacySettings, Section } from '@/types/firebase';

interface LocalAddress {
  id: string;
  label: string;
  street: string;
  city: string;
  postalCode: string;
  isDefault: boolean;
}

interface LocalPaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: string;
  expYear: string;
  isDefault: boolean;
}

const defaultNotificationSettings: NotificationSettings = {
  email: true,
  push: true,
  sms: false,
  marketing: true,
  bookingReminders: true,
  promotions: true,
  newMessages: true,
};

const defaultPrivacySettings: PrivacySettings = {
  profileVisible: true,
  bookingsVisible: false,
  showEmail: false,
  showPhone: false,
};

const sectionMeta: Record<
  ProfileRouteSection,
  { titleKey: MessageKey; descriptionKey: MessageKey; icon: typeof MapPin }
> = {
  addresses: {
    titleKey: 'route.profile.addresses.title',
    descriptionKey: 'route.profile.addresses.description',
    icon: MapPin,
  },
  payment: {
    titleKey: 'route.profile.payment.title',
    descriptionKey: 'route.profile.payment.description',
    icon: CreditCard,
  },
  notifications: {
    titleKey: 'route.profile.notifications.title',
    descriptionKey: 'route.profile.notifications.description',
    icon: Bell,
  },
  settings: {
    titleKey: 'route.profile.settings.title',
    descriptionKey: 'route.profile.settings.description',
    icon: Settings,
  },
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const CARD_BRANDS: Array<{ value: string; labelKey: MessageKey }> = [
  { value: 'Visa', labelKey: 'profileSection.payment.brand.visa' },
  { value: 'Mastercard', labelKey: 'profileSection.payment.brand.mastercard' },
  { value: 'American Express', labelKey: 'profileSection.payment.brand.amex' },
];

export function ProfileSectionScreen({ section }: { section: ProfileRouteSection }) {
  const { user, refreshUserProfile } = useAuthStore();
  const { t, setLocale, locale } = useI18n();
  const [addresses, setAddresses] = useState<LocalAddress[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<LocalPaymentMethod[]>([]);
  const [addressForm, setAddressForm] = useState({
    label: '',
    street: '',
    city: '',
    postalCode: '',
  });
  const [cardForm, setCardForm] = useState({
    brand: CARD_BRANDS[0].value,
    cardNumber: '',
    expMonth: '',
    expYear: '',
  });
  const [preferredSection, setPreferredSection] = useState<Section>('fit');
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(defaultPrivacySettings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const addressesStorageKey = user?.id ? `vfit.profile.addresses.${user.id}` : null;
  const paymentStorageKey = user?.id ? `vfit.profile.payment.${user.id}` : null;

  useEffect(() => {
    if (!user?.id) return;

    setPreferredSection(user.preferredSection || 'fit');
    const selectedLocale = user.preferredLanguage || 'it';
    setLocale(selectedLocale);
    setPrivacySettings(user.privacySettings || defaultPrivacySettings);

    if (addressesStorageKey) {
      try {
        const storedAddresses = localStorage.getItem(addressesStorageKey);
        setAddresses(storedAddresses ? (JSON.parse(storedAddresses) as LocalAddress[]) : []);
      } catch (error) {
        console.error('Failed to load local addresses:', error);
        setAddresses([]);
      }
    }

    if (paymentStorageKey) {
      try {
        const storedPayments = localStorage.getItem(paymentStorageKey);
        setPaymentMethods(storedPayments ? (JSON.parse(storedPayments) as LocalPaymentMethod[]) : []);
      } catch (error) {
        console.error('Failed to load local payment methods:', error);
        setPaymentMethods([]);
      }
    }
  }, [
    addressesStorageKey,
    paymentStorageKey,
    user?.id,
    user?.preferredLanguage,
    user?.preferredSection,
    user?.privacySettings,
    setLocale,
  ]);

  useEffect(() => {
    if (!addressesStorageKey) return;
    localStorage.setItem(addressesStorageKey, JSON.stringify(addresses));
  }, [addresses, addressesStorageKey]);

  useEffect(() => {
    if (!paymentStorageKey) return;
    localStorage.setItem(paymentStorageKey, JSON.stringify(paymentMethods));
  }, [paymentMethods, paymentStorageKey]);

  const defaultNotificationConfig = useMemo(
    () => user?.notificationSettings || defaultNotificationSettings,
    [user?.notificationSettings]
  );
  const privacyOptions: Array<{ key: keyof PrivacySettings; labelKey: MessageKey }> = [
    { key: 'profileVisible', labelKey: 'profileSection.privacy.profileVisible' },
    { key: 'bookingsVisible', labelKey: 'profileSection.privacy.bookingsVisible' },
    { key: 'showEmail', labelKey: 'profileSection.privacy.showEmail' },
    { key: 'showPhone', labelKey: 'profileSection.privacy.showPhone' },
  ];

  const meta = sectionMeta[section];
  const Icon = meta.icon;

  if (!user) {
    return (
      <div className="container-mobile py-6 pb-24">
        <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-tertiary">
          {t('profileSection.noUser')}
        </p>
      </div>
    );
  }

  const handleAddAddress = () => {
    if (!addressForm.label || !addressForm.street || !addressForm.city || !addressForm.postalCode) {
      return;
    }

    const newAddress: LocalAddress = {
      id: generateId(),
      ...addressForm,
      isDefault: addresses.length === 0,
    };

    setAddresses((current) => [...current, newAddress]);
    setAddressForm({
      label: '',
      street: '',
      city: '',
      postalCode: '',
    });
  };

  const setDefaultAddress = (addressId: string) => {
    setAddresses((current) =>
      current.map((address) => ({
        ...address,
        isDefault: address.id === addressId,
      }))
    );
  };

  const handleDeleteAddress = (addressId: string) => {
    setAddresses((current) => {
      const next = current.filter((address) => address.id !== addressId);
      if (next.length > 0 && !next.some((address) => address.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const handleAddPaymentMethod = () => {
    const digits = cardForm.cardNumber.replace(/\D/g, '');
    if (digits.length < 12 || cardForm.expMonth.length < 1 || cardForm.expYear.length < 2) {
      return;
    }

    const method: LocalPaymentMethod = {
      id: generateId(),
      brand: cardForm.brand,
      last4: digits.slice(-4),
      expMonth: cardForm.expMonth.padStart(2, '0'),
      expYear: cardForm.expYear,
      isDefault: paymentMethods.length === 0,
    };

    setPaymentMethods((current) => [...current, method]);
    setCardForm({
      brand: CARD_BRANDS[0].value,
      cardNumber: '',
      expMonth: '',
      expYear: '',
    });
  };

  const setDefaultPayment = (methodId: string) => {
    setPaymentMethods((current) =>
      current.map((method) => ({
        ...method,
        isDefault: method.id === methodId,
      }))
    );
  };

  const removePayment = (methodId: string) => {
    setPaymentMethods((current) => {
      const next = current.filter((method) => method.id !== methodId);
      if (next.length > 0 && !next.some((method) => method.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const handleSaveSettings = async () => {
    if (!user.id) return;
    setIsSavingSettings(true);
    setSaveStatus('idle');

    try {
      await Promise.all([
        updateUserProfile(user.id, {
          preferredSection,
          preferredLanguage: locale,
        }),
        updatePrivacySettings(user.id, privacySettings),
      ]);
      await refreshUserProfile();
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to save profile settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="container-mobile py-6 pb-24 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-section-primary/20 blur-2xl" />
        <div className="absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-section-secondary/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            {t('profileSection.badge')}
          </span>
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-section-primary/20 text-section-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-text-inverse">{t(meta.titleKey)}</h1>
              <p className="mt-1 text-sm text-text-secondary">{t(meta.descriptionKey)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/profile"
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-text-inverse"
            >
              {t('profileSection.backToProfile')}
            </Link>
            <Link
              href="/help"
              className="rounded-full bg-section-primary px-4 py-2 text-xs font-semibold text-background-dark"
            >
              {t('profileSection.helpCenter')}
            </Link>
          </div>
        </div>
      </section>

      {section === 'addresses' && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-text-inverse">
              {t('profileSection.addresses.addTitle')}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label={t('profileSection.addresses.label')}
                placeholder={t('profileSection.addresses.labelPlaceholder')}
                value={addressForm.label}
                onChange={(event) =>
                  setAddressForm((current) => ({ ...current, label: event.target.value }))
                }
              />
              <Input
                label={t('profileSection.addresses.street')}
                placeholder={t('profileSection.addresses.streetPlaceholder')}
                value={addressForm.street}
                onChange={(event) =>
                  setAddressForm((current) => ({ ...current, street: event.target.value }))
                }
              />
              <Input
                label={t('profileSection.addresses.city')}
                placeholder={t('profileSection.addresses.cityPlaceholder')}
                value={addressForm.city}
                onChange={(event) =>
                  setAddressForm((current) => ({ ...current, city: event.target.value }))
                }
              />
              <Input
                label={t('profileSection.addresses.postalCode')}
                placeholder={t('profileSection.addresses.postalCodePlaceholder')}
                value={addressForm.postalCode}
                onChange={(event) =>
                  setAddressForm((current) => ({ ...current, postalCode: event.target.value }))
                }
              />
            </div>
            <Button onClick={handleAddAddress} className="mt-3" fullWidth>
              <Plus className="mr-2 h-4 w-4" />
              {t('profileSection.addresses.saveAddress')}
            </Button>
          </div>

          <div className="space-y-3">
            {addresses.map((address) => (
              <article key={address.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-inverse">{address.label}</h3>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {address.street}, {address.city} {address.postalCode}
                    </p>
                  </div>
                  {address.isDefault && (
                    <span className="rounded-full bg-success-DEFAULT/20 px-2 py-1 text-[10px] font-semibold uppercase text-success-DEFAULT">
                      {t('common.default')}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!address.isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefaultAddress(address.id)}
                      className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-text-inverse"
                    >
                      {t('profileSection.addresses.setDefault')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(address.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-error-DEFAULT/30 px-3 py-1.5 text-xs font-semibold text-error-DEFAULT"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('common.remove')}
                  </button>
                </div>
              </article>
            ))}
            {addresses.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-tertiary">
                {t('profileSection.addresses.empty')}
              </p>
            )}
          </div>
        </section>
      )}

      {section === 'payment' && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-text-inverse">
              {t('profileSection.payment.addCard')}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-tertiary">
                  {t('profileSection.payment.network')}
                </label>
                <select
                  value={cardForm.brand}
                  onChange={(event) =>
                    setCardForm((current) => ({ ...current, brand: event.target.value }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-surface-elevated px-3 py-3 text-sm text-text-inverse focus:outline-none focus:ring-2 focus:ring-section-primary"
                >
                  {CARD_BRANDS.map((brand) => (
                    <option key={brand.value} value={brand.value}>
                      {t(brand.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label={t('profileSection.payment.cardNumber')}
                placeholder={t('profileSection.payment.cardNumberPlaceholder')}
                value={cardForm.cardNumber}
                onChange={(event) =>
                  setCardForm((current) => ({ ...current, cardNumber: event.target.value }))
                }
              />
              <Input
                label={t('profileSection.payment.expiryMonth')}
                placeholder={t('profileSection.payment.expiryMonthPlaceholder')}
                value={cardForm.expMonth}
                onChange={(event) =>
                  setCardForm((current) => ({
                    ...current,
                    expMonth: event.target.value.replace(/\D/g, '').slice(0, 2),
                  }))
                }
              />
              <Input
                label={t('profileSection.payment.expiryYear')}
                placeholder={t('profileSection.payment.expiryYearPlaceholder')}
                value={cardForm.expYear}
                onChange={(event) =>
                  setCardForm((current) => ({
                    ...current,
                    expYear: event.target.value.replace(/\D/g, '').slice(0, 2),
                  }))
                }
              />
            </div>
            <Button onClick={handleAddPaymentMethod} className="mt-3" fullWidth>
              <Plus className="mr-2 h-4 w-4" />
              {t('profileSection.payment.addMethod')}
            </Button>
          </div>

          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <article key={method.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-inverse">
                      {method.brand} •••• {method.last4}
                    </h3>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {t('profileSection.payment.expiry')}{' '}
                      {method.expMonth}/{method.expYear}
                    </p>
                  </div>
                  {method.isDefault && (
                    <span className="rounded-full bg-success-DEFAULT/20 px-2 py-1 text-[10px] font-semibold uppercase text-success-DEFAULT">
                      {t('common.default')}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!method.isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefaultPayment(method.id)}
                      className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-text-inverse"
                    >
                      {t('profileSection.payment.setDefault')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removePayment(method.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-error-DEFAULT/30 px-3 py-1.5 text-xs font-semibold text-error-DEFAULT"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('common.remove')}
                  </button>
                </div>
              </article>
            ))}
            {paymentMethods.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-text-tertiary">
                {t('profileSection.payment.empty')}
              </p>
            )}
          </div>
        </section>
      )}

      {section === 'notifications' && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <NotificationSettingsCard
            userId={user.id}
            settings={defaultNotificationConfig}
            onUpdate={() => {
              void refreshUserProfile();
            }}
          />
        </section>
      )}

      {section === 'settings' && (
        <section className="space-y-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-text-inverse">
              {t('profileSection.settings.appPreferences')}
            </h2>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-text-tertiary">
                  {t('profileSection.settings.defaultSection')}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['fit', 'fun', 'life'] as Section[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPreferredSection(item)}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-xs font-semibold uppercase transition-colors',
                        preferredSection === item
                          ? 'border-section-primary bg-section-primary text-background-dark'
                          : 'border-white/15 bg-white/5 text-text-tertiary'
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-text-tertiary">
                  {t('profileSection.settings.language')}
                </p>
                <LanguageSwitcher variant="row" className="mt-2" />
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-text-inverse">{t('profileSection.privacy.title')}</h2>
            <div className="mt-3 space-y-2">
              {privacyOptions.map(({ key, labelKey }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setPrivacySettings((current) => ({ ...current, [key]: !current[key] }))
                  }
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors',
                    privacySettings[key]
                      ? 'border-section-primary/40 bg-section-primary/10 text-text-inverse'
                      : 'border-white/10 bg-black/20 text-text-tertiary'
                  )}
                >
                  <span>{t(labelKey)}</span>
                  <span
                    className={cn(
                      'inline-flex h-5 w-9 items-center rounded-full p-1 transition-colors',
                      privacySettings[key] ? 'bg-section-primary' : 'bg-white/15'
                    )}
                  >
                    <span
                      className={cn(
                        'h-3.5 w-3.5 rounded-full bg-white transition-transform',
                        privacySettings[key] ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </span>
                </button>
              ))}
            </div>
          </article>

          <Button onClick={handleSaveSettings} isLoading={isSavingSettings} fullWidth>
            <Save className="mr-2 h-4 w-4" />
            {t('common.save')}
          </Button>

          {saveStatus === 'saved' && (
            <p className="flex items-center gap-2 text-sm text-success-DEFAULT">
              <CheckCircle2 className="h-4 w-4" />
              {t('profileSection.settings.saved')}
            </p>
          )}
          {saveStatus === 'error' && (
            <p className="flex items-center gap-2 text-sm text-error-DEFAULT">
              <Shield className="h-4 w-4" />
              {t('profileSection.settings.error')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
