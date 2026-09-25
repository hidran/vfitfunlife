# VFitFunLife — Gap Closure Plan

> **Baseline:** current shipped codebase (through 2026-08-14).
> **Goal:** close P0/P1 gaps from the VFITFUNLIFE vision document, in roadmap order.
> **Method:** Epics → Stories → Acceptance Criteria → TDD tasks. One epic at a time. P0 first.

---

## EPICS OVERVIEW

| Epic | Stories | Priority | Roadmap phase |
|---|---|---|---|
| **E1 — XP & Levels** | 3 | P0 | Season 0 |
| **E2 — Streak Tracking** | 2 | P0 | Season 0 |
| **E3 — Season 0 Reward Engine** | 2 | P0 | Season 0 |
| **E4 — Family Layer (MVP)** | 2 | P0 | Season 0 |
| **E5 — Badge System** | 3 | P1 | Engagement |
| **E6 — Challenge Participation** | 3 | P1 | Engagement |
| **E7 — Streaming per Trainer** | 4 | P1 | Engagement |
| **E8 — Referral Quality Gating** | 2 | P1 | Engagement |
| **E9 — AI Mission Director (MVP)** | 3 | P2 | Engagement |
| **E10 — Marketplace Automation** | 3 | P2 | Marketplace |
| **E11 — Creator/UGC Layer** | 3 | P2 | Engagement |
| **E12 — VToken branding & narrative** | 2 | P1 | Branding |
| **E13 — KPI instrumentation** | 3 | P1 | Analytics |

**P0 total:** 9 stories (E1-E4). **P1:** 18. **P2:** 9.

---

## E1 — XP & LEVELS

**Goal:** users earn XP from activities; XP determines level; level is displayed as status.
**Vision ref:** §4 (XP misura la progressione; VToken può essere il reward), §5 (loop), §16 (KPI).

### S1.1 — XP field on User + base earning rules

**AC:**
- `User.xp` number field (default 0)
- XP earned on: booking completed (+50), review written (+10), referral friend activated (+100), challenge completed (+varies)
- XP separate from `pointsBalance`
- XP earned server-side only (callable/transaction), never client-writable
- XP never decreases (except admin adjustment)

### S1.2 — Level derivation from XP

**AC:**
- Level formula: `level = max(1, floor(sqrt(max(0, xp) / 100)))` → L1: 0-399, L2: 400-899, L3: 900-1599, L4: 1600-2499, L5: 2500-3599, L6+: continuing square thresholds
- Next level threshold: `100 * (level + 1)^2`; `xpToNextLevel = nextLevelThreshold - xp` (so 0 XP → 400 XP to next level)
- `User.level` denormalized (stored, updated on every XP change)
- `User.xpToNextLevel` denormalized
- No functional level gates in P0 (gates are P1)

### S1.3 — XP/Level display on profile

**AC:**
- Profile shows: XP bar (xp/xpToNextLevel), level badge ("Livello N"), pointsBalance beside it
- Stats panel shows: XP total, level, bookings count, referrals count, challenges completed
- "Progress to next level" hint text when < 90% to next level

### TDD TASKS E1

| Task | File | Test |
|---|---|---|
| T1.1 gamification lib | `src/lib/gamification.ts` + `src/lib/gamification.test.ts` | pure unit tests for computeLevel/xpForBooking/xpForReview/xpForReferral/xpForChallenge/denormalizeUserGamification roundtrip |
| T1.2 data model + CF | `src/types/firebase.ts` (add fields), `functions/src/users/gamification.ts` + `functions/src/users/index.ts` re-export, `functions/src/users/gamification.test.ts` | unit tests for seedDefaultSeason0Progress sets xp=0/level=1/xpToNextLevel=400 |
| T1.3 client hook + UI | `src/hooks/useUserGamification.ts`, `src/hooks/useUserGamification.test.ts`, `src/components/profile/ProfileGamificationCard.tsx`, `src/components/profile/ProfileStatsCard.tsx` update | unit tests for hook; smoke via Playwright |

---

## E2 — STREAK TRACKING

**Goal:** daily check-in → streak counter → daily XP+CER reward → visual streak card.
**Vision ref:** §4 (Streak +50/giorno retention), §5 (ritorno all'app), §16 (streak KPI).

### S2.1 — Daily check-in callable + streak logic

**AC:**
- `checkIn()` callable: increments streak if last check-in < 24h ago; resets to 1 if gap > 24h; blocks double check-in same day
- Fields: `User.dayStreak` (number), `User.lastCheckInAt` (Timestamp)
- Reward per check-in: +10 XP + 5 points (Day 1), +20 XP + 10 points (Day 2-6), +50 XP + 25 points (Day 7+), +100 bonus points on day 7/14/30 milestones
- Reward written as PointsTransaction (source=checkin) + XP increment (via shared gamification helper)
- Streak milestone badges earned server-side (P1 badge system will display them; P0 just records)

### S2.2 — Streak UI on profile

**AC:**
- Profile shows streak card: fire icon + count, "Ultimo check-in: oggi/ieri" or "Streak interrotto"
- Today check-in button (disabled if already checked in)
- Streak milestones shown (7, 14, 30, 60, 90 days) with earned/not-earned state

### TDD TASKS E2

| Task | File | Test |
|---|---|---|
| T2.1 check-in callable | `functions/src/users/checkin.ts` + `functions/src/users/index.ts` re-export, `functions/src/users/checkin.test.ts` | unit tests for first check-in, consecutive, gap reset, same-day block, milestone rewards |
| T2.2 streak UI | `src/components/profile/StreakCard.tsx`, update `src/app/(main)/profile/page.tsx`, `src/components/profile/StreakCard.test.tsx` | unit/render test + Playwright smoke |

---

## E3 — SEASON 0 REWARD ENGINE

**Goal:** onboarding rewards for profile completion, interests, zone, family creation.
**Vision ref:** §4 (Iscrizione +100, Profilo completo +150, Interessi +100, Zona/città +50, Crea famiglia +300).

### S3.1 — Onboarding reward callables

**AC:**
- `claimProfileCompleteReward()`: +150 XP + 150 points, one-time, guards duplicate via flag `hasClaimedProfileComplete`
- `claimInterestsReward(interestsCount)`: +100 XP + 100 points when ≥3 interests set, one-time
- `claimZoneReward(zoneId)`: +50 XP + 50 points when zone/city set, one-time
- `claimFamilyReward(familyId)`: +300 XP + 300 points when user creates/joined a family, one-time
- All rewards write PointsTransaction (source=season0_*) + XP increment
- All guards idempotent (calling twice = no-op, returns current state)

### S3.2 — Wire into onboarding/profile flows

**AC:**
- Registration flow: after completeRegistration, auto-claim signup reward (+100 XP + 100 points welcome — already partly there as pointsBalance:100; make it explicit via transaction)
- Profile edit: after saving fullName+dateOfBirth+phone, prompt "Completa profilo → +150 XP + 150 punti" button
- Interests page (or profile edit): after selecting ≥3 interests, show reward claim
- Zone/città selection (add if missing — currently no zone field): after setting, claim reward
- Family creation: after creating family, claim reward

### TDD TASKS E3

| Task | File | Test |
|---|---|---|
| T3.1 reward callables | `functions/src/users/season0Rewards.ts` + `functions/src/users/index.ts` re-export, `functions/src/users/season0Rewards.test.ts` | unit tests for each reward, idempotency, duplicate guard |
| T3.2 wire into flows | update `src/lib/firebase/auth.ts` completeRegistration, `src/app/(main)/profile/edit/page.tsx`, add interests/zone fields if missing, `src/app/(main)/onboarding/**` if exists | unit test for client-side reward claim wrapper; Playwright smoke |

> **Note:** current app has no "interests" or "zone/città" fields on User. For P0 we add them as optional fields (`interests: string[]`, `homeCity: string`) and wire the reward claims to them. If the UI for interests/zone doesn't exist yet, we add minimal UI in profile edit.

---

## E4 — FAMILY LAYER (MVP)

**Goal:** user can create/join one family; family reward; family visible on profile.
**Vision ref:** §6 (Family Nucleo familiare, Family Wallet, trasferimento token, obiettivi condivisi, Crea famiglia +300).

### S4.1 — Family entity + create/join callables

**AC:**
- `Family` doc: `{ id, name, createdBy, memberCount, createdAt, settings: { allowTransfers, maxMembers } }`
- `User.familyId: string | null`, `User.familyRole: "creator" | "member"`
- `createFamily(name)`: caller becomes creator, gets +300 XP + 300 points reward (season0), familyId written on user
- `joinFamily(familyId, inviteCode?)`: adds member, enforces one-family-per-user (reject if already in family), max members cap
- `inviteCode` generated per family (simple alphanumeric), used for join
- Family document readable by members only (basic security)

### S4.2 — Family creation UI

**AC:**
- Profile shows "La tua famiglia" section: family name + member count + "Crea famiglia" / "Esci dalla famiglia" / "Partecipa con codice"
- Create family: name input → create → reward claimed automatically → shows family card
- One-family enforcement: can't join second family; must leave first (future P1)

### TDD TASKS E4

| Task | File | Test |
|---|---|---|
| T4.1 family callables + types | `src/types/firebase.ts` (Family, familyId, familyRole on User), `functions/src/users/family.ts` + `functions/src/users/index.ts` re-export, `functions/src/users/family.test.ts` | unit tests for create, join, one-family guard, max members, invite code, reward claim |
| T4.2 family UI | `src/components/profile/FamilyCard.tsx`, update `src/app/(main)/profile/page.tsx`, `src/components/profile/FamilyCard.test.tsx` | render + interaction test; Playwright smoke |

---

## P0 DELIVERABLE

After E1-E4 the app has a functional Season 0 loop:
`signup → +100 welcome → profile complete → +150 → interests → +100 → zone → +50 → daily check-in streak → +XP/points/day → invite friend → +200/+300 → create family → +300 → XP bar + level + rewards ledger visible on profile`

The app now gamifies without marketplace transactions, per §3-4 of the vision document.

---

## P1 EPICS (after P0)

- **E5 Badge System:** badge definitions collection, userBadges subcollection, earn-on-event hooks, badge showcase on profile.
- **E6 Challenge Participation:** userChallenges subcollection per active challenge, progress tracking, completion handler → XP+points+badge.
- **E7 Streaming per Trainer:** trainer streaming schedule, live status, per-trainer streams (extends existing streamingSchedule).
- **E8 Referral Quality Gating:** full referral reward only after friend's first completed booking.
- **E12 VToken branding:** rename points→VToken in UI copy (separate from XP), tokenomics narrative page.
- **E13 KPI instrumentation:** track streak days, family count, token issued/used, UGC count, CAC proxy.

## P2 EPICS (after P1)

- **E9 AI Mission Director:** mission suggestions personalized by XP/level/interests, AI-generated weekly missions.
- **E10 Marketplace Automation:** Stripe checkout per booking, auto-commission, subscription tiers.
- **E11 Creator/UGC Layer:** content posts, creator profiles, content feed, live streaming integration.

---

*Document version:* 2026-09-18.
*Implements:* VFITFUNLIFE vision §1-5, §16. P0 = Season 0 core loop.
