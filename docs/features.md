# Feature Requirements

## Screen Flow

```
Splash → Onboarding (first launch) → Auth → Main App
                                          ↓
                    ┌─────────────────────┼─────────────────────┐
                    ↓                     ↓                     ↓
                  VFit                  VFun                  VLife
                    ↓                     ↓                     ↓
              ┌─────┴─────┐         ┌─────┴─────┐         ┌─────┴─────┐
              │ Gyms      │         │ Events    │         │ Wellness  │
              │ Classes   │         │ VR        │         │ Estetica  │
              │ Trainers  │         │ Party     │         │ Services  │
              │ Virtual   │         │ Streaming │         │ Camera Ip │
              └───────────┘         └───────────┘         └───────────┘
```

---

## 1. Splash Screen
- [x] Animated "V" logo with gradient morph effect
- [x] Tagline "FIT • FUN • LIFE" with stagger animation
- [x] Auto-advance after 2s or tap to skip
- [x] Check authentication state
- [x] Preload critical assets and fonts
- [x] Platform-specific: Use Capacitor Splash Screen plugin for native

## 2. Onboarding (First Launch Only)
- [x] 4-screen horizontal carousel
  - Screen 1: Welcome + app intro
  - Screen 2: VFit features highlight
  - Screen 3: VFun features highlight
  - Screen 4: VLife features highlight
- [x] Skip button (top right)
- [x] Progress dots
- [x] "Get Started" CTA on last screen
- [x] Store `hasOnboarded` flag in localStorage/AsyncStorage

## 3. Authentication
### 3.1 Login Screen
- [x] Phone number input with country code picker (default +39 Italy)
- [x] "Send OTP" button
- [x] Divider "oppure"
- [x] Social login buttons: Google, Apple (iOS only), Facebook
- [x] "Non hai un account? Registrati" link
- [x] Terms & Privacy links at bottom

### 3.2 OTP Verification
- [x] 6-digit code input with auto-focus advance
- [x] Countdown timer (60s) for resend
- [x] "Resend Code" button (disabled during countdown)
- [x] Auto-submit on complete
- [x] Error handling with shake animation

### 3.3 Registration (if new user)
- [x] Full name input
- [x] Email input (optional)
- [x] Date of birth picker
- [x] Avatar upload (camera/gallery)
- [x] Section preference (FIT/FUN/LIFE priority)
- [x] Terms & Privacy checkbox (required)
- [x] "Completa Registrazione" CTA

### 3.4 Permissions (after registration)
- [x] Location permission request with explanation
- [x] Push notification permission request
- [x] Skip option for each

---

## 4. Main Tab Navigation

Bottom tabs with section-aware theming:
```
[ Home ] [ Search ] [ Bookings ] [ Profile ]
```

### 4.1 Home Tab
- [x] Dynamic header with section switcher (FIT | FUN | LIFE)
- [x] Section colors change entire screen theme
- [x] Pull-to-refresh
- [x] Content changes based on active section

#### Home - VFit Content
- [x] VIP upgrade banner (if not VIP) or active discount badge
- [x] Quick actions: "Palestre", "Corsi", "A Domicilio", "Virtual"
- [x] "Palestre Vicine" horizontal carousel
  - Venue cards with image, name, rating, distance
  - "Vedi tutte" link
- [x] "Corsi Oggi" section
  - Class cards with time, name, instructor, spots
- [x] "Istruttori Top" carousel
  - Instructor cards with photo, name, specialty, rating
- [x] "Le Tue Sfide" active challenges preview
- [x] Map preview with venue markers

#### Home - VFun Content
- [ ] Featured event hero banner (full width, auto-scroll)
- [ ] Quick actions: "Eventi", "VR", "Party", "TV"
- [ ] "Prossimi Eventi" list
  - Event cards with image, date, title, price
- [ ] "VR Experiences" carousel
- [ ] "Live Now" streaming indicator (if active)
- [ ] "Palinsesto" TV schedule preview
- [ ] "Lavora Con Noi" CTA card

#### Home - VLife Content
- [x] VIP banner with wellness discount
- [x] Quick actions grid:
  - Wellness: Osteopatia, Fisioterapia, Mental Coach, Psicologo
  - Estetica: Estetista, Parrucchiere, Unghie, Massaggi
- [x] "Servizi a Domicilio" highlight section
- [x] "Centri Vicini" venue carousel
- [x] "Recensioni" testimonials carousel
- [x] "Camera Iperbarica" feature card
- [x] "Contatta per Preventivo" floating CTA

---

## 5. VFit Screens

### 5.1 Gyms List (`/fit/gyms`)
- [ ] Toggle: List view / Map view
- [ ] Filter bar: Distance, Rating, Amenities, Price range
- [ ] Sort: Nearest, Top rated, Price low-high
- [ ] Gym cards in list
- [ ] Map with clustered markers
- [ ] Search bar

### 5.2 Gym Detail (`/venue/[id]`)
- [x] Hero image carousel with dots
- [x] Venue name, rating, review count
- [x] "Partner" badge if applicable
- [x] Address with "Directions" button (opens native maps)
- [x] Opening hours (expandable, current status indicator)
- [x] Amenities grid with icons
- [x] Description (expandable)
- [x] "Servizi" tab - list of services with prices
- [x] "Corsi" tab
