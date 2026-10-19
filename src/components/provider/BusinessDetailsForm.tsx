'use client';

import { useId, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { normalizeVatNumber } from '@/lib/vatNumber';
import {
  BUSINESS_VENUE_TYPES,
  DEFAULT_BUSINESS_ID_PREFIX,
  businessFieldId,
  type BusinessDetailsErrors,
  type BusinessDetailsField,
  type BusinessDetailsMode,
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
  /**
   * 'apply' (default) is the signup form. 'edit' is the profile card after approval:
   * legal name, P.IVA, venue type and address are admin-verified and shown read-only
   * (readOnly, not disabled, so they stay readable by assistive tech), and a description
   * appears. The frozen values never change through onChange.
   */
  mode?: BusinessDetailsMode;
}

const VENUE_LABEL_KEY = {
  gym: 'provider.business.venue.gym',
  school: 'provider.business.venue.school',
  studio: 'provider.business.venue.studio',
  none: 'provider.business.venue.none',
} as const;

const FROZEN_IN_EDIT: readonly BusinessDetailsField[] = ['legalName', 'vatNumber', 'venueType', 'address'];

const fieldClass =
  'min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted/60 focus:outline-none focus:ring-2 focus:ring-vfit-primary';
const frozenClass = 'bg-surface-2 text-content-muted cursor-default';

/**
 * Company details of a business provider, filled in at signup (or from the profile card).
 * Plain controlled inputs over state the caller owns (see useBusinessDetails). The public
 * name is whatever the user typed — empty means "same as the legal name", which the
 * placeholder shows and toBusinessApplicationInput applies.
 */
export function BusinessDetailsForm({
  values,
  onChange,
  errors = {},
  onClearError,
  disabled,
  idPrefix = DEFAULT_BUSINESS_ID_PREFIX,
  mode = 'apply',
}: BusinessDetailsFormProps) {
  const { t } = useI18n();
  const hintId = useId();
  const frozenHintId = useId();
  const editing = mode === 'edit';

  const id = (field: BusinessDetailsField) => businessFieldId(field, idPrefix);
  const errorId = (field: BusinessDetailsField) => `${id(field)}-error`;
  const isFrozen = (field: BusinessDetailsField) => editing && FROZEN_IN_EDIT.includes(field);

  const set = (field: BusinessDetailsField, value: string) => {
    onClearError?.(field);
    onChange({ ...values, [field]: value });
  };

  /** The change handler of a field, or none for a frozen one: its value never moves. */
  const change = (field: BusinessDetailsField) =>
    isFrozen(field)
      ? undefined
      : (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(field, e.target.value);

  const normalizeVatOnBlur = () => {
    const normalized = normalizeVatNumber(values.vatNumber);
    if (normalized !== values.vatNumber) onChange({ ...values, vatNumber: normalized });
  };

  const needsPremises = values.venueType !== 'none';

  const renderError = (field: BusinessDetailsField) =>
    errors[field] ? (
      <p id={errorId(field)} role="alert" className="mt-1 text-xs text-[#EF4444]">
        {t(errors[field]!)}
      </p>
    ) : null;

  // What validateBusinessDetails refuses when empty, per mode. aria-required rather than the
  // native `required`, so the form's own inline errors stay in charge (no browser bubbles).
  const isRequired = (field: BusinessDetailsField) => {
    if (editing) return field === 'displayName';
    if (field === 'legalName' || field === 'vatNumber') return true;
    return needsPremises && (field === 'address' || field === 'city');
  };

  const a11y = (field: BusinessDetailsField, describedBy?: string) => ({
    'aria-required': isRequired(field) ? true : undefined,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby':
      [errors[field] ? errorId(field) : null, isFrozen(field) ? frozenHintId : null, describedBy ?? null]
        .filter(Boolean)
        .join(' ') || undefined,
    readOnly: isFrozen(field) || undefined,
  });

  const inputClass = (field: BusinessDetailsField) =>
    cn(fieldClass, errors[field] ? 'border-[#EF4444]' : 'border-hairline', isFrozen(field) && frozenClass);

  const label = (field: BusinessDetailsField, key: MessageKey) => (
    <label htmlFor={id(field)} className="mb-1 block text-xs font-semibold text-content-muted">
      {t(key)}
    </label>
  );

  return (
    <div className="business-details-form space-y-3">
      {editing && (
        <p id={frozenHintId} className="text-xs text-content-muted">
          {t('provider.business.frozenHint')}
        </p>
      )}

      <div>
        {label('legalName', 'provider.business.legalName')}
        <input
          id={id('legalName')}
          type="text"
          autoComplete="organization"
          value={values.legalName}
          onChange={change('legalName')}
          disabled={disabled}
          className={inputClass('legalName')}
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
          placeholder={editing ? undefined : t('provider.business.vatPlaceholder')}
          value={values.vatNumber}
          onChange={change('vatNumber')}
          onBlur={editing ? undefined : normalizeVatOnBlur}
          disabled={disabled}
          className={inputClass('vatNumber')}
          {...a11y('vatNumber')}
        />
        {renderError('vatNumber')}
      </div>

      <div>
        {label('displayName', 'provider.business.displayName')}
        <input
          id={id('displayName')}
          type="text"
          placeholder={editing ? undefined : values.legalName}
          value={values.displayName}
          onChange={change('displayName')}
          disabled={disabled}
          className={inputClass('displayName')}
          {...a11y('displayName', hintId)}
        />
        {renderError('displayName')}
        <p id={hintId} className="mt-1 text-xs text-content-muted">
          {t(editing ? 'provider.business.edit.displayNameHint' : 'provider.business.displayNameHint')}
        </p>
      </div>

      {editing && (
        <div>
          {label('description', 'provider.business.description')}
          <textarea
            id={id('description')}
            rows={4}
            maxLength={2000}
            placeholder={t('provider.business.descriptionPlaceholder')}
            value={values.description}
            onChange={change('description')}
            disabled={disabled}
            className={cn(inputClass('description'), 'resize-none')}
            {...a11y('description')}
          />
          {renderError('description')}
        </div>
      )}

      <div>
        {label('venueType', 'provider.business.venueType')}
        {editing ? (
          // Display-only: a company stored without a venue type (see businessDetailsFromProvider) shows empty.
          <input
            id={id('venueType')}
            type="text"
            value={values.venueType ? t(VENUE_LABEL_KEY[values.venueType]) : ''}
            disabled={disabled}
            className={inputClass('venueType')}
            {...a11y('venueType')}
          />
        ) : (
          <select
            id={id('venueType')}
            value={values.venueType}
            onChange={(e) => set('venueType', e.target.value as BusinessVenueType)}
            disabled={disabled}
            className={inputClass('venueType')}
            {...a11y('venueType')}
          >
            {BUSINESS_VENUE_TYPES.map((venue) => (
              <option key={venue} value={venue}>{t(VENUE_LABEL_KEY[venue])}</option>
            ))}
          </select>
        )}
        {renderError('venueType')}
      </div>

      {needsPremises && (
        <div>
          {label('address', 'provider.business.address')}
          <input
            id={id('address')}
            type="text"
            autoComplete="street-address"
            value={values.address}
            onChange={change('address')}
            disabled={disabled}
            className={inputClass('address')}
            {...a11y('address')}
          />
          {renderError('address')}
        </div>
      )}

      {(needsPremises || editing) && (
        <div>
          {label('city', 'provider.business.city')}
          <input
            id={id('city')}
            type="text"
            autoComplete="address-level2"
            value={values.city}
            onChange={change('city')}
            disabled={disabled}
            className={inputClass('city')}
            {...a11y('city')}
          />
          {renderError('city')}
        </div>
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
          onChange={change('website')}
          disabled={disabled}
          className={inputClass('website')}
          {...a11y('website')}
        />
        {renderError('website')}
      </div>
    </div>
  );
}
