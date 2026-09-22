/**
 * Whether signing up as a professional approves you, or queues you for an admin.
 *
 * Pure module: the document path, the defaults and the merge, with no firebase-admin import,
 * so the decision that actually matters — what an absent or half-written settings document
 * means — is testable on its own.
 */

export const PROVIDER_ONBOARDING_DOC = "systemSettings/providerOnboarding";

export interface ProviderOnboardingSettings {
  /**
   * True: an applicant is verified on the spot and listed immediately.
   * False: they are stored as a pending application for an admin to decide.
   *
   * Defaults to true. The marketplace is still filling up with professionals, and making
   * every signup wait on someone clicking a button is the friction this removes. Turning it
   * off is how the back office takes that back once there are enough of them — the
   * onboarding path is the only thing that changes, and `decideProviderApplication` works
   * the same either way.
   */
  autoApprove: boolean;
}

export const DEFAULT_PROVIDER_ONBOARDING: ProviderOnboardingSettings = {
  autoApprove: true,
};

/**
 * Merge a stored document over the defaults.
 *
 * Anything that is not an explicit boolean falls back to the default rather than to `false`:
 * a missing document, a half-written one, or a value of the wrong type must not silently
 * switch the product into a mode nobody chose. Turning auto-approval off is a deliberate act
 * and has to look like one in the data.
 */
export function mergeProviderOnboarding(
  stored: Partial<ProviderOnboardingSettings> | undefined | null
): ProviderOnboardingSettings {
  return {
    autoApprove:
      typeof stored?.autoApprove === "boolean" ?
        stored.autoApprove :
        DEFAULT_PROVIDER_ONBOARDING.autoApprove,
  };
}

/** Thrown for a payload the caller could fix by sending something else. */
export class ProviderOnboardingValidationError extends Error {}

/** The settings patch to store, rejecting anything outside the one known field. */
export function validateProviderOnboardingUpdate(
  updates: Partial<ProviderOnboardingSettings> | undefined
): ProviderOnboardingSettings {
  const keys = Object.keys(updates ?? {});
  if (keys.length === 0) {
    throw new ProviderOnboardingValidationError("No settings supplied");
  }
  for (const key of keys) {
    if (key !== "autoApprove") {
      throw new ProviderOnboardingValidationError(`Unknown setting: ${key}`);
    }
  }
  if (typeof updates?.autoApprove !== "boolean") {
    throw new ProviderOnboardingValidationError("autoApprove must be a boolean");
  }
  return { autoApprove: updates.autoApprove };
}
