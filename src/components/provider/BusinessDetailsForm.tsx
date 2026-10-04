'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type ReactNode } from 'react';
import { useForm, useWatch, type FieldError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import type { BusinessLegalForm } from '@/types/firebase';
import type { BusinessApplicationInput } from '@/lib/firebase/providerApplication';
import {
  BUSINESS_FIELD_LIMITS,
  BUSINESS_LEGAL_FORMS,
  EMPTY_BUSINESS_DETAILS,
  businessDetailsSchema,
  toBusinessApplication,
  type BusinessDetailsFormValues,
  type BusinessField,
} from '@/lib/businessDetails';
import {
  PROVIDER_APPLICATION_ERRORS,
  type ProviderApplicationErrorCode,
} from '@/lib/providerApplicationErrors';

const LEGAL_FORM_LABELS: Record<BusinessLegalForm, MessageKey> = {
  company: 'provider.business.legalForm.company',
  sole_trader: 'provider.business.legalForm.soleTrader',
  association: 'provider.business.legalForm.association',
  other: 'provider.business.legalForm.other',
};

/** Every message the form can show: its schema messages and the field-level server codes. */
const FIELD_ERROR_KEYS: ReadonlySet<string> = new Set<MessageKey>([
  'provider.business.error.legalNameRequired',
  'provider.business.error.nameInvalid',
  'provider.business.error.vatRequired',
  'provider.business.error.vatInvalid',
  'provider.business.error.vatTaken',
  'provider.business.error.vatLocked',
  'provider.business.error.legalFormInvalid',
  'provider.business.error.affiliationInvalid',
  'provider.business.error.cityInvalid',
  'provider.business.error.websiteInvalid',
  'provider.business.error.descriptionInvalid',
]);

export interface BusinessDetailsFormState {
  /** The normalised payload when every field is valid, else null. */
  value: BusinessApplicationInput | null;
  isValid: boolean;
}

export interface BusinessDetailsFormHandle {
  /**
   * Validate every field. When something is wrong the errors appear on their fields, focus
   * moves to the first one and this resolves to null; otherwise to the normalised payload.
   */
  validate: () => Promise<BusinessApplicationInput | null>;
  /**
   * Show a failure from `applyAsProvider` on the field it is about (e.g. a tax id another
   * account already registered) and focus that field. False when the code is about no field —
   * the caller then shows it as a form-level message.
   */
  showServerError: (code: ProviderApplicationErrorCode) => boolean;
}

export interface BusinessDetailsFormProps {
  /**
   * 'create' (signup). 'edit' is reserved for the company profile editor (plan B6), where the
   * legal name and tax id become read-only; it is not implemented yet and renders as 'create'.
   */
  mode?: 'create' | 'edit';
  defaultValues?: Partial<BusinessDetailsFormValues>;
  /** Called with the current value and validity on mount and after every change. */
  onChange?: (state: BusinessDetailsFormState) => void;
  disabled?: boolean;
}

function evaluate(values: Partial<BusinessDetailsFormValues>): BusinessDetailsFormState {
  const parsed = businessDetailsSchema.safeParse({ ...EMPTY_BUSINESS_DETAILS, ...values });
  return parsed.success
    ? { value: toBusinessApplication(parsed.data), isValid: true }
    : { value: null, isValid: false };
}

/**
 * The company / association part of a provider application (plan 2026-10-04, B5): legal name,
 * P.IVA or an association's codice fiscale, legal form, affiliation number, public name, city,
 * website and description.
 *
 * A sub-form, not a `<form>`: it sits inside the signup form (forms can't nest), keeps its own
 * React Hook Form state and hands the result over through the ref (`validate`,
 * `showServerError`) and `onChange`.
 */
export const BusinessDetailsForm = forwardRef<BusinessDetailsFormHandle, BusinessDetailsFormProps>(
  function BusinessDetailsForm({ mode = 'create', defaultValues, onChange, disabled }, ref) {
    const { t } = useI18n();
    const baseId = useId();
    const {
      register,
      control,
      handleSubmit,
      setError,
      setFocus,
      getValues,
      subscribe,
      formState: { errors },
    } = useForm<BusinessDetailsFormValues>({
      resolver: zodResolver(businessDetailsSchema),
      defaultValues: { ...EMPTY_BUSINESS_DETAILS, ...defaultValues },
      mode: 'onTouched',
      reValidateMode: 'onChange',
      shouldFocusError: true,
    });

    const legalName = useWatch({ control, name: 'legalName' });

    // Report value + validity without re-rendering into a loop: a subscription fires on real
    // changes only, whatever the parent does with the callback.
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    });
    useEffect(() => {
      onChangeRef.current?.(evaluate(getValues()));
      return subscribe({
        formState: { values: true },
        callback: ({ values }) => onChangeRef.current?.(evaluate(values)),
      });
    }, [getValues, subscribe]);

    // A server error arrives while the parent still has the form disabled (it is submitting),
    // and a disabled control can't take focus: focus once a render has re-enabled it.
    const focusAfterRender = useRef<BusinessField | null>(null);
    useEffect(() => {
      const field = focusAfterRender.current;
      if (!field || disabled) return;
      focusAfterRender.current = null;
      setFocus(field);
    });

    useImperativeHandle(
      ref,
      () => ({
        // handleSubmit runs the resolver, shows every error and focuses the first invalid field
        // (shouldFocusError). It also marks the form submitted, so from then on each field
        // re-validates as it is edited — which is what clears a server error on change.
        validate: () =>
          new Promise<BusinessApplicationInput | null>((resolve) => {
            void handleSubmit(
              (values) => resolve(toBusinessApplication(values)),
              () => resolve(null)
            )();
          }),
        showServerError: (code) => {
          const entry = PROVIDER_APPLICATION_ERRORS[code];
          if (!entry?.field) return false;
          setError(entry.field, { type: 'server', message: entry.messageKey });
          focusAfterRender.current = entry.field;
          return true;
        },
      }),
      [handleSubmit, setError]
    );

    const idOf = (field: BusinessField) => `${baseId}-${field}`;
    const errorText = (error: FieldError | undefined): string | undefined => {
      if (!error) return undefined;
      const message = error.message ?? '';
      return FIELD_ERROR_KEYS.has(message) ? t(message as MessageKey) : t('provider.card.error');
    };
    /** aria wiring of one control: invalid state, plus its hint and its error as description. */
    const a11y = (field: BusinessField, hasHint = false) => {
      const describedBy = [
        hasHint ? `${idOf(field)}-hint` : null,
        errors[field] ? `${idOf(field)}-error` : null,
      ].filter(Boolean);
      return {
        id: idOf(field),
        'aria-invalid': errors[field] ? true : undefined,
        'aria-describedby': describedBy.length ? describedBy.join(' ') : undefined,
      };
    };
    const invalidClass = (field: BusinessField) => errors[field] && 'border-error ring-1 ring-error';
    const textareaOrSelect =
      'w-full rounded-xl border border-hairline bg-surface-input px-4 text-base text-content focus:outline-none focus:ring-2 focus:ring-section-primary';

    return (
      <fieldset className="min-w-0 space-y-4 rounded-xl border border-hairline p-3" disabled={disabled} data-mode={mode}>
        <legend className="px-1 text-sm font-semibold text-content break-words">
          {t('provider.business.legend')}
        </legend>
        <p className="text-xs text-content-muted break-words">{t('provider.business.intro')}</p>

        <Field
          id={idOf('legalName')}
          label={t('provider.business.field.legalName')}
          error={errorText(errors.legalName)}
        >
          <Input
            {...register('legalName')}
            {...a11y('legalName')}
            aria-required
            autoComplete="organization"
            maxLength={BUSINESS_FIELD_LIMITS.legalName}
            placeholder={t('provider.business.placeholder.legalName')}
            className={cn(invalidClass('legalName'))}
          />
        </Field>

        <Field
          id={idOf('vatNumber')}
          label={t('provider.business.field.vatNumber')}
          hint={t('provider.business.hint.vatNumber')}
          error={errorText(errors.vatNumber)}
        >
          <Input
            {...register('vatNumber')}
            {...a11y('vatNumber', true)}
            aria-required
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            placeholder="01234567890"
            className={cn(invalidClass('vatNumber'))}
          />
        </Field>

        <Field
          id={idOf('legalForm')}
          label={t('provider.business.field.legalForm')}
          error={errorText(errors.legalForm)}
        >
          <select
            {...register('legalForm')}
            {...a11y('legalForm')}
            className={cn(textareaOrSelect, 'min-h-[52px]', invalidClass('legalForm'))}
          >
            {BUSINESS_LEGAL_FORMS.map((form) => (
              <option key={form} value={form}>
                {t(LEGAL_FORM_LABELS[form])}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id={idOf('affiliationNumber')}
          label={t('provider.business.field.affiliationNumber')}
          hint={t('provider.business.hint.affiliationNumber')}
          error={errorText(errors.affiliationNumber)}
        >
          <Input
            {...register('affiliationNumber')}
            {...a11y('affiliationNumber', true)}
            autoComplete="off"
            maxLength={BUSINESS_FIELD_LIMITS.affiliationNumber}
            className={cn(invalidClass('affiliationNumber'))}
          />
        </Field>

        <Field
          id={idOf('displayName')}
          label={t('provider.business.field.displayName')}
          hint={t('provider.business.hint.displayName')}
          error={errorText(errors.displayName)}
        >
          <Input
            {...register('displayName')}
            {...a11y('displayName', true)}
            maxLength={BUSINESS_FIELD_LIMITS.displayName}
            placeholder={legalName?.trim() || undefined}
            className={cn(invalidClass('displayName'))}
          />
        </Field>

        <Field id={idOf('city')} label={t('provider.business.field.city')} error={errorText(errors.city)}>
          <Input
            {...register('city')}
            {...a11y('city')}
            autoComplete="address-level2"
            maxLength={BUSINESS_FIELD_LIMITS.city}
            placeholder={t('provider.business.placeholder.city')}
            className={cn(invalidClass('city'))}
          />
        </Field>

        <Field
          id={idOf('website')}
          label={t('provider.business.field.website')}
          error={errorText(errors.website)}
        >
          <Input
            {...register('website')}
            {...a11y('website')}
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={BUSINESS_FIELD_LIMITS.website}
            placeholder="www.example.it"
            className={cn(invalidClass('website'))}
          />
        </Field>

        <Field
          id={idOf('description')}
          label={t('provider.business.field.description')}
          error={errorText(errors.description)}
        >
          <textarea
            {...register('description')}
            {...a11y('description')}
            rows={3}
            maxLength={BUSINESS_FIELD_LIMITS.description}
            className={cn(textareaOrSelect, 'min-h-24 py-3', invalidClass('description'))}
          />
        </Field>
      </fieldset>
    );
  }
);

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/**
 * Label, control, hint and error of one field. The error sits in an always-present polite
 * live region, so it is announced when it appears; the control also points at it through
 * `aria-describedby`.
 */
function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-content break-words">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-content-muted break-words">
          {hint}
        </p>
      )}
      <div aria-live="polite">
        {error && (
          <p id={`${id}-error`} className="text-sm text-error break-words">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
