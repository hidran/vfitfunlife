import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '@/i18n/messages';
import type { BusinessApplicationInput } from '@/lib/firebase/functions';
import {
  DEFAULT_BUSINESS_ID_PREFIX,
  EMPTY_BUSINESS_DETAILS,
  firstBusinessError,
  focusBusinessField,
  providerApplicationErrorFor,
  toBusinessApplicationInput,
  validateBusinessDetails,
  type BusinessDetailsErrors,
  type BusinessDetailsField,
  type BusinessDetailsValues,
} from '@/lib/businessDetails';

interface UseBusinessDetailsOptions {
  /**
   * True while the inputs are disabled (the form is submitting). A focus scheduled then — a
   * server error arrives while the page is still loading — waits until they are enabled
   * again; focusing a disabled input does nothing.
   */
  disabled?: boolean;
}

/**
 * State and submit logic of the company form, shared by the register page and the profile
 * card: values, per-field errors, `validate()` for the client rules and `applyServerError()`
 * for what applyAsProvider refused. Both put the error under its input and move focus there.
 */
export function useBusinessDetails(idPrefix = DEFAULT_BUSINESS_ID_PREFIX, { disabled = false }: UseBusinessDetailsOptions = {}) {
  const [values, setValues] = useState<BusinessDetailsValues>(EMPTY_BUSINESS_DETAILS);
  const [errors, setErrors] = useState<BusinessDetailsErrors>({});
  // The field waiting for focus lives in a ref (consumed, not rendered); `focusRequest`
  // only exists to re-run the effect after a request, and `disabled` to re-run it once the
  // inputs can take focus again.
  const pendingFocus = useRef<BusinessDetailsField | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const scheduleFocus = (field: BusinessDetailsField) => {
    pendingFocus.current = field;
    setFocusRequest((n) => n + 1);
  };

  useEffect(() => {
    if (!pendingFocus.current || disabled) return;
    focusBusinessField(pendingFocus.current, idPrefix);
    pendingFocus.current = null;
  }, [focusRequest, disabled, idPrefix]);

  const clearError = useCallback((field: BusinessDetailsField) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  /** The callable payload when the form is valid; otherwise null, with the errors shown and focus on the first. */
  const validate = useCallback((): BusinessApplicationInput | null => {
    const nextErrors = validateBusinessDetails(values);
    setErrors(nextErrors);
    const first = firstBusinessError(nextErrors);
    if (first) {
      scheduleFocus(first);
      return null;
    }
    return toBusinessApplicationInput(values);
  }, [values]);

  /** Shows why the server refused and returns the message to announce. */
  const applyServerError = useCallback((err: unknown): MessageKey => {
    const { key, field } = providerApplicationErrorFor(err);
    if (field) {
      setErrors({ [field]: key });
      scheduleFocus(field);
    }
    return key;
  }, []);

  const reset = useCallback(() => {
    setValues(EMPTY_BUSINESS_DETAILS);
    setErrors({});
    pendingFocus.current = null;
  }, []);

  return { values, setValues, errors, clearError, validate, applyServerError, reset, idPrefix };
}
