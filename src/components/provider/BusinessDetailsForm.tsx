'use client';

import { useId, useState, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { normalizeVatNumber } from '@/lib/vatNumber';
import {
  BUSINESS_VENUE_TYPES,
  firstBusinessError,
  type BusinessDetailsErrors,
  type BusinessDetailsField,
  type BusinessDetailsValues,
} from '@/lib/businessDetails';
import type { BusinessVenueType } from '@/types/firebase';
import type { MessageKey } from '@/i18n/messages';

interface BusinessDetailsFormProps {
  values: BusinessDetailsValues;
  onChange: (values: BusinessDetailsValues) => void;
  /** Per-field message keys; the parent owns them so submit can set server errors too. */
  errors?: BusinessDetailsErrors;
  /** Clears one field's error as soon as it is edited. */
  onClearError?: (field: BusinessDetailsField) => void;
  disabled?: boolean;
  /** Stable prefix for the input ids, so a parent can focus a field by name. */
  idPrefix?: string;
}

export const DEFAULT_BUSINESS_ID_PREFIX = 'business';

export function businessFieldId(field: BusinessDetailsField, prefix = DEFAULT_BUSINESS_ID_PREFIX): string {
  return `${prefix}-${field}`;
}

/** Moves focus to the first field in error, in screen order. Returns false when nothing is wrong. */
export function focusFirstBusinessError(errors: BusinessDetailsErrors, prefix = DEFAULT_BUSINESS_ID_PREFIX): boolean {
  const field = firstBusinessError(errors);
  if (!field) return false;
  document.getElementById(businessFieldId(field, prefix))?.focus();
  return true;
}

const VENUE_LABEL_KEY = {
  gym: 'provider.business.venue.gym',
  school: 'provider.business.venue.school',
  studio: 'provider.business.venue.studio',
  none: 'provider.business.venue.none',
} as const;

const fieldClass =
  'min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted/60 focus:outline-none focus:ring-2 focus:ring-vfit-primary';

/**
 * Company details of a business provider, filled in at signup (or from the profile card).
 * Plain controlled inputs: the register page keeps its own state and so does this. The
 * public name follows the legal name until the user types one of their own.
 */
export function BusinessDetailsForm({
  values,
  onChange,
  errors = {},
  onClearError,
  disabled,
  idPrefix = DEFAULT_BUSINESS_ID_PREFIX,
}: BusinessDetailsFormProps) {
  const { t } = useI18n();
  const hintId = useId();
  const [displayNameEdited, setDisplayNameEdited] = useState(false);

  const id = (field: BusinessDetailsField) => businessFieldId(field, idPrefix);
  const errorId = (field: BusinessDetailsField) => `${id(field)}-error`;

  const set = (field: BusinessDetailsField, value: string) => {
    onClearError?.(field);
    if (field === 'legalName') {
      onChange({ ...values, legalName: value, displayName: displayNameEdited ? values.displayName : value });
      return;
    }
    if (field === 'displayName') {
      // An emptied public name goes back to following the legal name.
      setDisplayNameEdited(value !== '');
      onChange({ ...values, displayName: value === '' ? values.legalName : value });
      return;
    }
    onChange({ ...values, [field]: value });
  };

  const text = (field: BusinessDetailsField) => (e: ChangeEvent<HTMLInputElement>) => set(field, e.target.value);

  const needsPremises = values.venueType !== 'none';

  const renderError = (field: BusinessDetailsField) =>
    errors[field] ? (
      <p id={errorId(field)} role="alert" className="mt-1 text-xs text-[#EF4444]">
        {t(errors[field]!)}
      </p>
    ) : null;

  const a11y = (field: BusinessDetailsField, describedBy?: string) => ({
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': [errors[field] ? errorId(field) : null, describedBy ?? null].filter(Boolean).join(' ') || undefined,
  });

  const label = (field: BusinessDetailsField, key: MessageKey) => (
    <label htmlFor={id(field)} className="mb-1 block text-xs font-semibold text-content-muted">
      {t(key)}
    </label>
  );

  return (
    <div className="business-details-form space-y-3">
      <div>
        {label('legalName', 'provider.business.legalName')}
        <input
          id={id('legalName')}
          type="text"
          autoComplete="organization"
          value={values.legalName}
          onChange={text('legalName')}
          disabled={disabled}
          className={cn(fieldClass, errors.legalName ? 'border-[#EF4444]' : 'border-hairline')}
          {...a11y('legalName')}
        />
        {renderError('legalName')}
      </div>

      <div>
        {label('vatNumber', 'provider.business.vatNumber')}
        <input
          id={id('vatNumber')}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('provider.business.vatPlaceholder')}
          value={values.vatNumber}
          onChange={text('vatNumber')}
          onBlur={() => {
            const normalized = normalizeVatNumber(values.vatNumber);
            if (normalized !== values.vatNumber) onChange({ ...values, vatNumber: normalized });
          }}
          disabled={disabled}
          className={cn(fieldClass, errors.vatNumber ? 'border-[#EF4444]' : 'border-hairline')}
          {...a11y('vatNumber')}
        />
        {renderError('vatNumber')}
      </div>

      <div>
        {label('displayName', 'provider.business.displayName')}
        <input
          id={id('displayName')}
          type="text"
          value={values.displayName}
          onChange={text('displayName')}
          disabled={disabled}
          className={cn(fieldClass, errors.displayName ? 'border-[#EF4444]' : 'border-hairline')}
          {...a11y('displayName', hintId)}
        />
        {renderError('displayName')}
        <p id={hintId} className="mt-1 text-xs text-content-muted">{t('provider.business.displayNameHint')}</p>
      </div>

      <div>
        {label('venueType', 'provider.business.venueType')}
        <select
          id={id('venueType')}
          value={values.venueType}
          onChange={(e) => set('venueType', e.target.value as BusinessVenueType)}
          disabled={disabled}
          className={cn(fieldClass, errors.venueType ? 'border-[#EF4444]' : 'border-hairline')}
          {...a11y('venueType')}
        >
          {BUSINESS_VENUE_TYPES.map((venue) => (
            <option key={venue} value={venue}>{t(VENUE_LABEL_KEY[venue])}</option>
          ))}
        </select>
        {renderError('venueType')}
      </div>

      {needsPremises && (
        <>
          <div>
            {label('address', 'provider.business.address')}
            <input
              id={id('address')}
              type="text"
              autoComplete="street-address"
              value={values.address}
              onChange={text('address')}
              disabled={disabled}
              className={cn(fieldClass, errors.address ? 'border-[#EF4444]' : 'border-hairline')}
              {...a11y('address')}
            />
            {renderError('address')}
          </div>

          <div>
            {label('city', 'provider.business.city')}
            <input
              id={id('city')}
              type="text"
              autoComplete="address-level2"
              value={values.city}
              onChange={text('city')}
              disabled={disabled}
              className={cn(fieldClass, errors.city ? 'border-[#EF4444]' : 'border-hairline')}
              {...a11y('city')}
            />
            {renderError('city')}
          </div>
        </>
      )}

      <div>
        {label('website', 'provider.business.website')}
        <input
          id={id('website')}
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder={t('provider.business.websitePlaceholder')}
          value={values.website}
          onChange={text('website')}
          disabled={disabled}
          className={cn(fieldClass, errors.website ? 'border-[#EF4444]' : 'border-hairline')}
          {...a11y('website')}
        />
        {renderError('website')}
      </div>
    </div>
  );
}
