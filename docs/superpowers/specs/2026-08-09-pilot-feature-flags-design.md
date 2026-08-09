# Pilot Mode Feature Flags — Design Spec

**Date:** 2026-08-09
**Status:** Approved (design)
**Author:** Hidran Arias (with Claude Code)
**Priority:** P1-3

## 1. Summary

The Torino pilot is fitness-only. Empty VFun and VLife sections would undercut first
impressions with the trainers we are recruiting, so they are hidden behind flags that can be
flipped from the Firebase console without a release.

## 2. Premise correction

The brief says Remote Config is "already integrated per CLAUDE.md". **It is not.** There are
zero `RemoteConfig` references in `src/` or `functions/`.

There is a `featureFlags: Record<string, boolean>` in `PlatformSettings`, but it is dead in
exactly the way `dailyStats` was: `src/app/admin/settings/page.tsx` toggles local component
state against hardcoded defaults, `src/lib/firebase/admin.ts:518` returns `{}`, and **nothing
reads it at runtime**. It is a settings UI wired to nothing.

So this feature adds Remote Config from scratch, as the brief intends.

## 3. Why Remote Config rather than the Firestore settings doc

The flags must apply to **signed-out visitors** — the tab bar and section switcher render
before login. A Firestore-backed flag would need `platform/settings` to be publicly readable
and would cost a document read on every cold start. Remote Config needs no auth, is cached by
the SDK, and is the mechanism the brief asks for.

## 4. The flash-of-wrong-content problem

Remote Config fetches asynchronously. Naively, the app paints with VFun and VLife visible and
then hides them a moment later — which is worse than not hiding them at all, because it
advertises that the sections exist.

**Mitigation: `pilot_mode` defaults to `true` in the bundled defaults.** First paint is
already correct for the pilot; a fetched `false` later reveals the sections. The safe state is
the default state, so a failed or slow fetch degrades to pilot mode rather than out of it.

## 5. Flags

| Key | Default | Effect |
|---|---|---|
| `pilot_mode` | `true` | Master switch. When on, applies everything below |
| `show_vfun` | `false` | VFun tab, section and `/fun` routes |
| `show_vlife` | `false` | VLife tab, section and `/life` routes |
| `pilot_city` | `"Torino"` | Default and only city filter while `pilot_mode` is on |

`show_vfun` / `show_vlife` are independent of `pilot_mode` so a section can be re-enabled on
its own without turning the whole pilot mode off.

## 6. Behaviour when `pilot_mode` is on

- VFun / VLife hidden from the tab bar (`TabBar.tsx`), side drawer (`SideDrawer.tsx`) and
  header switcher (`Header.tsx`).
- `/fun/*` and `/life/*` **redirect to `/home`**. Hiding the entrance is not enough — a
  bookmark, a push deep link or a search result would still land there.
- A persisted `preferredSection` of `fun` or `life` in localStorage is coerced back to `fit`.
  Returning users would otherwise boot straight into a hidden section.
- Non-fitness provider categories are hidden from search and provider registration.
- `pilot_city` is the default city filter.

**No code is deleted.** Everything stays behind the flag, re-enableable from the console.

## 7. Implementation

| File | Responsibility |
|---|---|
| `src/lib/firebase/remoteConfig.ts` | **Create.** Init, defaults, typed accessors |
| `src/hooks/usePilotFlags.ts` | **Create.** React hook exposing resolved flags |
| `src/contexts/SectionContext.tsx` | **Modify.** Coerce a hidden persisted section back to `fit` |
| `src/components/layout/{TabBar,SideDrawer,Header}.tsx` | **Modify.** Filter hidden sections |
| `src/app/(main)/fun/layout.tsx`, `.../life/layout.tsx` | **Create.** Redirect guard |

Remote Config is a **client-only** SDK. Under `output: 'export'` it must be initialised
lazily in the browser, never at module scope, or the build breaks on the server pass.

`minimumFetchIntervalMillis` is 1 hour in production — long enough to avoid hammering, short
enough that flipping a flag takes effect within the hour without a release. Set to 0 in
development so changes are testable immediately.

## 8. Testing

| Level | Coverage |
|---|---|
| Unit | Defaults resolve to pilot mode when Remote Config is unavailable; `show_vfun`/`show_vlife` independently override; a persisted hidden section is coerced to `fit` |
| E2E | `/fun` and `/life` redirect to `/home` under pilot mode; the tab bar shows only VFit |
| Manual | Browser verification; flip a flag in the console and confirm it takes effect |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Flash of hidden sections before the fetch resolves | Defaults bundled with `pilot_mode: true`; the safe state is the default |
| Remote Config unavailable (adblock, offline, native webview) | Defaults apply, which is pilot mode — failure degrades to the safe state |
| Someone re-enables a section while its content is still empty | Flags are independent, so it can be reverted instantly without a release |
| The dead `featureFlags` settings UI now sits next to a real flag system | Out of scope to remove, but noted — two flag mechanisms, one of which does nothing, is a trap |

## 10. Definition of done

- VFun/VLife hidden from all three navigation surfaces under `pilot_mode`.
- `/fun` and `/life` redirect to `/home`.
- A persisted hidden section is coerced to `fit`.
- Flags flippable from the Firebase console with no release.
- Strings in all five locales; `completeness.test.ts` green.
- No code deleted.
