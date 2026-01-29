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
- [ ] Phone number input with country code picker (default +39 Italy)
- [ ] "Send OTP" button
- [ ] Divider "oppure"
- [x] Social login buttons: Google, Apple (iOS only), Facebook
- [ ] "Non hai un account? Registrati" link
- [ ] Terms & Privacy links at bottom

### 3.2 OTP Verification
- [ ] 6-digit code input with auto-focus advance
- [ ] Countdown timer (60s) for resend
- [ ] "Resend Code" button (disabled during countdown)
- [ ] Auto-submit on complete
- [ ] Error handling with shake animation

### 3.3 Registration (if new user)
- [ ] Full name input
- [ ] Email input (optional)
- [ ] Date of birth picker
- [ ] Avatar upload (camera/gallery)
- [ ] Section preference (FIT/FUN/LIFE priority)
- [ ] Terms & Privacy checkbox (required)
- [ ] "Completa Registrazione" CTA

### 3.4 Permissions (after registration)
- [ ] Location permission request with explanation
- [ ] Push notification permission request
- [ ] Skip option for each

---

## 4. Main Tab Navigation

Bottom tabs with section-aware theming:
```
[ Home ] [ Search ] [ Bookings ] [ Profile ]
```

### 4.1 Home Tab
- [ ] Dynamic header with section switcher (FIT | FUN | LIFE)
- [ ] Section colors change entire screen theme
- [ ] Pull-to-refresh
- [ ] Content changes based on active section

#### Home - VFit Content
- [ ] VIP upgrade banner (if not VIP) or active discount badge
- [ ] Quick actions: "Palestre", "Corsi", "A Domicilio", "Virtual"
- [ ] "Palestre Vicine" horizontal carousel
  - Venue cards with image, name, rating, distance
  - "Vedi tutte" link
- [ ] "Corsi Oggi" section
  - Class cards with time, name, instructor, spots
- [ ] "Istruttori Top" carousel
  - Instructor cards with photo, name, specialty, rating
- [ ] "Le Tue Sfide" active challenges preview
- [ ] Map preview with venue markers

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
- [ ] VIP banner with wellness discount
- [ ] Quick actions grid:
  - Wellness: Osteopatia, Fisioterapia, Mental Coach, Psicologo
  - Estetica: Estetista, Parrucchiere, Unghie, Massaggi
- [ ] "Servizi a Domicilio" highlight section
- [ ] "Centri Vicini" venue carousel
- [ ] "Recensioni" testimonials carousel
- [ ] "Camera Iperbarica" feature card
- [ ] "Contatta per Preventivo" floating CTA

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
- [ ] Hero image carousel with dots
- [ ] Venue name, rating, review count
- [ ] "Partner" badge if applicable
- [ ] Address with "Directions" button (opens native maps)
- [ ] Opening hours (expandable, current status indicator)
- [ ] Amenities grid with icons
- [ ] Description (expandable)
- [ ] "Servizi" tab - list of services with prices
- [ ] "Corsi" tab
