/**
 * "Explicit pre-login choice" markers.
 *
 * The locale and theme are persisted to users/{uid} so they follow a user across
 * devices, and the profile value normally wins when the user doc loads. A choice made
 * while logged OUT (on the landing or login page) can't be persisted yet — there is no
 * uid — so without a marker it would be silently overwritten by the profile at login.
 *
 * When a user explicitly picks a locale/theme while logged out we record it here (with a
 * timestamp). On the next login the sync code sees the marker, writes the choice to the
 * profile instead of adopting the profile value, and clears the marker.
 */

export type ExplicitChoiceKind = 'locale' | 'theme';

export interface ExplicitChoice {
  value: string;
  /** epoch ms when the choice was made */
  at: number;
}

const KEYS: Record<ExplicitChoiceKind, string> = {
  locale: 'vfit.locale.explicit',
  theme: 'vfit.theme.explicit',
};

export function explicitChoiceKey(kind: ExplicitChoiceKind): string {
  return KEYS[kind];
}

export function markExplicitChoice(kind: ExplicitChoiceKind, value: string): void {
  try {
    const payload: ExplicitChoice = { value, at: Date.now() };
    window.localStorage.setItem(KEYS[kind], JSON.stringify(payload));
  } catch {
    /* storage unavailable — the choice simply won't survive login */
  }
}

export function readExplicitChoice(kind: ExplicitChoiceKind): ExplicitChoice | null {
  try {
    const raw = window.localStorage.getItem(KEYS[kind]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExplicitChoice>;
    if (typeof parsed?.value !== 'string') return null;
    return { value: parsed.value, at: typeof parsed.at === 'number' ? parsed.at : 0 };
  } catch {
    return null;
  }
}

export function clearExplicitChoice(kind: ExplicitChoiceKind): void {
  try {
    window.localStorage.removeItem(KEYS[kind]);
  } catch {
    /* ignore */
  }
}
