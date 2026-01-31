# VFit Implementation Plan

## Executive Summary

Based on analysis of `/Users/hidranarias/projects/vfit/docs/features.md` and the existing codebase, this document outlines the implementation plan for all unchecked features.

### Current Status Overview

| Feature | Status | Notes |
|---------|--------|-------|
| Login - Registrati link | ✅ Already Done | Implemented in login page (lines 275-281) |
| Pull-to-refresh | ✅ Already Done | `use-pull-to-refresh` integrated in home page |
| VFit Home Content | ✅ Already Done | Fully implemented with mock data |
| VLife Home Content | ✅ Already Done | Fully implemented with mock data |
| VFun Home Content | ⚠️ Partial | Placeholder implementation - needs full build |
| Gyms List | ⚠️ Partial | List view done, map needs clustering enhancement |
| Gym Detail | ✅ Already Done | All features implemented |

---

## 1. Login Screen - "Non hai un account? Registrati" Link

### Status: ✅ ALREADY IMPLEMENTED

**Current Implementation:**
- File: `/Users/hidranarias/projects/vfit/src/app/auth/login/page.tsx` (lines 275-281)
- Already links to `/auth/register`

**Action Required:** Update `features.md` to mark as complete `[x]`

---

## 2. Home Tab - Pull-to-Refresh Functionality

### Status: ✅ ALREADY IMPLEMENTED

**Current Implementation:**
- File: `/Users/hidranarias/projects/vfit/src/app/(main)/home/page.tsx` (lines 644-687)
- Uses `use-pull-to-refresh` library
- Has visual indicator (spinner + arrow)
- Currently uses mock delay: `new Promise(resolve => setTimeout(resolve, 2000))`

**Action Required:** 
1. Update `features.md` to mark as complete `[x]`
2. Connect to actual data refresh when API is ready

---

## 3. Home - VFit Content

### Status: ✅ ALREADY IMPLEMENTED

**Current Implementation Location:**
- File: `/Users/hidranarias/projects/vfit/src/app/(main)/home/page.tsx`
- Component: `VFitHome()` (lines 387-641)

**Implemented Features:**

| Feature | Implementation | Lines |
|---------|---------------|-------|
| VIP upgrade banner | Gradient card with CTA | 390-413 |
| Quick actions (Palestre, Corsi, A Domicilio, Virtual) | 2x2 grid with icons | 415-467 |
| Palestre Vicine carousel | Horizontal scroll cards | 469-510 |
| Corsi Oggi section | Time-based class cards | 512-542 |
| Istruttori Top carousel | Avatar + rating cards | 544-579 |
| Le Tue Sfide | Progress bar challenges | 581-610 |
| Map preview | Stylistic map with markers | 612-638 |

**Action Required:** Update `features.md` to mark all as complete `[x]`

---

## 4. Home - VFun Content

### Status: ⚠️ NEEDS FULL IMPLEMENTATION

**Current Implementation:**
- File: `/Users/hidranarias/projects/vfit/src/app/(main)/home/page.tsx`
- Component: `VFunHome()` (lines 690-771)
- **Current State:** Placeholder with basic section info, no real content

**Mock Data Already Available:**
```typescript
// Lines 140-246 in home/page.tsx
- vfunQuickActions
- vfunFeaturedEvent  
- vfunUpcomingEvents
- vfunVRExperiences
- vfunTVSchedule
- vfunIsStreamingLive
```

### Implementation Plan

#### Phase 1: Featured Event Hero Banner
```typescript
// New Component: src/components/vfun/FeaturedEventBanner.tsx
interface FeaturedEventBannerProps {
  event: {
    id: string;
    title: string;
    subtitle: string;
    date: string;
    location: string;
    price: string;
    tag: string;
    attendees: number;
    image?: string;
  };
}
```

**UI/UX:**
- Full-width carousel (auto-scroll every 5s)
- Gradient overlay for text readability
- "Sold Out" / "Hot" / "VIP" badges
- Swipeable on mobile

**Dependencies:**
- Framer Motion for transitions
- Existing theme colors (vfun-primary: #B461FF)

#### Phase 2: Quick Actions Grid
```typescript
// Update existing vfunQuickActions structure
const vfunQuickActions = [
  { label: 'Eventi', icon: Ticket, href: '/fun/events', color: 'vfun-primary' },
  { label: 'VR', icon: Glasses, href: '/fun/vr', color: 'vfun-accent' },
  { label: 'Party', icon: PartyPopper, href: '/fun/parties', color: 'vfun-secondary' },
  { label: 'TV', icon: Tv, href: '/fun/tv', color: 'vfun-primary' },
];
```

**UI/UX:**
- 2x2 grid matching VFit/VLife style
- VFun purple/pink gradient theme
- Hover lift effect

#### Phase 3: Prossimi Eventi List
```typescript
// New Component: src/components/vfun/EventCard.tsx
interface EventCardProps {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  price: string;
  image?: string;
  tag?: string;
}
```

**UI/UX:**
- Horizontal scroll list
- Date badge (day/month)
- Price badge
- "Hot"/"VIP"/"Nuovo" tags

#### Phase 4: VR Experiences Carousel
```typescript
// New Component: src/components/vfun/VRExperienceCard.tsx
interface VRExperienceProps {
  id: string;
  title: string;
  duration: string;
  level: 'Principiante' | 'Intermedio' | 'Avanzato' | 'Tutti';
  rating: number;
  price: string;
}
```

**UI/UX:**
- Card with level badge (color-coded)
- Duration pill
- Star rating
- Price badge

#### Phase 5: Live Now Indicator
```typescript
// Component: LiveIndicator
interface LiveIndicatorProps {
  isLive: boolean;
  channelName?: string;
  currentShow?: string;
}
```

**UI/UX:**
- Pulsing red dot animation
- "LIVE" badge
- Channel name
- Current show title

#### Phase 6: Palinsesto TV Schedule
```typescript
// New Component: src/components/vfun/TVSchedule.tsx
interface TVScheduleItem {
  time: string;
  title: string;
  channel: string;
  isLive: boolean;
}
```

**UI/UX:**
- Timeline layout
- Current time indicator
- Channel badges (V Wellness, V Fit, V Life, V Fun)
- Expandable for full schedule

### Implementation Order
1. Quick Actions (reuse existing pattern) - 1 hour
2. Prossimi Eventi list - 2 hours
3. Featured Event Hero - 2 hours
4. VR Experiences carousel - 2 hours
5. Live Now indicator - 1 hour
6. Palinsesto schedule - 2 hours

**Estimated Total: 10 hours**

---

## 5. Home - VLife Content

### Status: ✅ ALREADY IMPLEMENTED

**Current Implementation:**
- File: `/Users/hidranarias/projects/vfit/src/app/(main)/home/page.tsx`
- Component: `VLifeHome()` (lines 773-1069)

**Implemented Features:**

| Feature | Implementation | Lines |
|---------|---------------|-------|
| VIP wellness discount banner | Gradient with CTA | 777-800 |
| Quick actions (Wellness) | 2x2 grid | 802-834 |
| Quick actions (Estetica) | 2x2 grid | 836-868 |
| Servizi a Domicilio highlight | Feature card with tags | 870-900 |
| Centri Vicini carousel | Horizontal scroll | 902-957 |
| Recensioni testimonials | Quote cards carousel | 959-1002 |
| Camera Iperbarica card | Feature card with stats | 1004-1056 |
| Floating CTA button | Fixed bottom button | 1058-1066 |

**Action Required:** Update `features.md` to mark all as complete `[x]`

---

## 6. VFit Screens - Gyms List (`/fit/gyms`)

### Status: ⚠️ PARTIALLY IMPLEMENTED

**Current Implementation:**
- File: `/Users/hidranarias/projects/vfit/src/app/(main)/fit/gyms/page.tsx`
- Lines: 1-290

**Implemented:**
- ✅ Toggle: List view / Map view (lines 146-183)
- ✅ Filter bar UI (lines 133-144)
- ✅ Sort options (lines 176-182)
- ✅ Search bar (lines 110-131)
- ✅ Gym cards in list view

**Needs Enhancement:**
- ⚠️ Map view uses mock markers (needs real Mapbox integration)
- ⚠️ Filters are UI-only (need filter logic)

### Enhancement Plan

#### Map View - Real Mapbox Integration
```typescript
// Install: npm install mapbox-gl
// Create: src/components/map/VenueMap.tsx

interface VenueMapProps {
  venues: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    rating: number;
  }>;
  userLocation?: { lat: number; lng: number };
  onVenueSelect: (id: string) => void;
}
```

**Implementation Steps:**
1. Add Mapbox GL JS dependency
2. Create reusable `VenueMap` component
3. Add geolocation hook for user position
4. Implement clustered markers for performance
5. Add venue detail popup on marker click

#### Filter Logic Implementation
```typescript
// Create: src/hooks/useGymFilters.ts
interface FilterState {
  distance: number; // km
  minRating: number;
  amenities: string[];
  priceRange: [number, number];
}

interface SortOption {
  field: 'distance' | 'rating' | 'price';
  direction: 'asc' | 'desc';
}
```

**UI Components Needed:**
- `FilterBottomSheet` - Mobile-friendly filter drawer
- `DistanceSlider` - Range selector for distance
- `AmenityChips` - Multi-select amenities
- `PriceRangeSlider` - Dual-handle price range

### Implementation Order
1. Create useGymFilters hook - 2 hours
2. Implement filter UI components - 3 hours
3. Add Mapbox integration - 4 hours
4. Connect filters to backend - 2 hours

**Estimated Total: 11 hours**

---

## 7. VFit Screens - Gym Detail (`/venue/[id]`)

### Status: ✅ ALREADY IMPLEMENTED

**Current Implementation:**
- File: `/Users/hidranarias/projects/vfit/src/app/(main)/venue/[id]/VenueDetailClient.tsx`
- Lines: 1-246

**Implemented Features:**

| Feature | Implementation | Lines |
|---------|---------------|-------|
| Hero image carousel with dots | Color gradient slides | 41-69 |
| Venue name, rating, reviews | Header section | 74-86 |
| "Partner" badge | Conditional badge | 81-85 |
| Address with Directions button | Address + button | 88-99 |
| Opening hours (expandable) | Collapsible list | 102-124 |
| Amenities grid with icons | 2-column grid | 126-146 |
| Description (expandable) | Read more/less | 148-162 |
| Servizi tab | Services list with prices | 164-207 |
| Corsi tab | Class schedule | 208-234 |
| "Prenota adesso" CTA | Bottom button | 237-242 |

**Action Required:** Update `features.md` to mark all as complete `[x]`

**Enhancement Suggestions:**
- Replace gradient placeholders with real images when CDN is ready
- Add "Share" button
- Add "Save to Favorites" functionality
- Add real-time availability for classes

---

## Component Architecture

### New Components to Create

```
src/
├── components/
│   ├── vfun/
│   │   ├── FeaturedEventBanner.tsx    # Hero carousel for events
│   │   ├── EventCard.tsx               # Event list item
│   │   ├── VRExperienceCard.tsx        # VR session card
│   │   ├── LiveIndicator.tsx           # Live streaming badge
│   │   └── TVSchedule.tsx              # TV program list
│   ├── map/
│   │   └── VenueMap.tsx                # Mapbox map with markers
│   └── filters/
│       ├── FilterBottomSheet.tsx       # Mobile filter drawer
│       ├── DistanceSlider.tsx          # Distance range input
│       ├── AmenityChips.tsx            # Multi-select chips
│       └── PriceRangeSlider.tsx        # Dual price slider
├── hooks/
│   └── useGymFilters.ts                # Filter state management
└── lib/
    └── mapbox.ts                       # Mapbox configuration
```

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Data Sources                          │
├─────────────────────────────────────────────────────────────┤
│  Firestore                    API Endpoints                 │
│  ├── users/{uid}              ├── /api/venues               │
│  ├── venues/{id}              ├── /api/classes              │
│  ├── events                   ├── /api/events               │
│  └── bookings                 └── /api/schedule             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      React Query Cache                       │
│         (TanStack Query for server state)                   │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  Home Page  │ │  Gyms Page  │ │ Venue Detail│
    └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Implementation Priority

### Phase 1: Quick Wins (Update Documentation)
- [ ] Mark all already-implemented features as complete in features.md
- Estimated: 30 minutes

### Phase 2: VFun Content (High Priority)
- [ ] Implement VFunHome full content
- [ ] Create FeaturedEventBanner component
- [ ] Create EventCard component  
- [ ] Create VRExperienceCard component
- [ ] Create LiveIndicator component
- [ ] Create TVSchedule component
- Estimated: 10 hours

### Phase 3: Map Enhancement (Medium Priority)
- [ ] Integrate Mapbox GL
- [ ] Create VenueMap component
- [ ] Add geolocation support
- [ ] Implement marker clustering
- Estimated: 6 hours

### Phase 4: Filter Enhancement (Medium Priority)
- [ ] Create useGymFilters hook
- [ ] Create FilterBottomSheet component
- [ ] Implement filter UI components
- [ ] Connect to backend
- Estimated: 7 hours

---

## Dependencies to Add

```json
{
  "dependencies": {
    "mapbox-gl": "^3.18.1",
    "react-map-gl": "^7.1.0"
  },
  "devDependencies": {
    "@types/mapbox-gl": "^3.0.0"
  }
}
```

---

## Testing Strategy

### Unit Tests
```typescript
// src/components/vfun/__tests__/EventCard.test.tsx
describe('EventCard', () => {
  it('renders event details correctly');
  it('displays tag badge when provided');
  it('formats price correctly');
  it('navigates to event detail on click');
});
```

### Integration Tests
- Test filter state persistence
- Test map marker interactions
- Test pull-to-refresh data reload

### E2E Tests
- User journey: Home → Gyms List → Map View → Venue Detail
- User journey: Home → VFun → Event Booking

---

## Summary Table

| Feature | Status | Effort | Priority |
|---------|--------|--------|----------|
| Login - Registrati link | ✅ Done | - | - |
| Pull-to-refresh | ✅ Done | - | - |
| VFit Home | ✅ Done | - | - |
| VLife Home | ✅ Done | - | - |
| VFun Home | ⚠️ Needed | 10h | HIGH |
| Gyms List - Filters | ⚠️ Enhancement | 7h | MEDIUM |
| Gyms List - Map | ⚠️ Enhancement | 6h | MEDIUM |
| Gym Detail | ✅ Done | - | - |

**Total Estimated Effort for Remaining Work: 23 hours**
