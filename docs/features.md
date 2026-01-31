# Feature Requirements

## Table of Contents
- [Screen Flow](#screen-flow)
- [Splash Screen](#1-splash-screen)
- [Onboarding](#2-onboarding-first-launch-only)
- [Authentication](#3-authentication)
- [Main Tab Navigation](#4-main-tab-navigation)
- [VFit Screens](#5-vfit-screens)
- [User Profile](#user-profile)
- [Booking System](#booking-system)
- [Admin Backoffice](#admin-backoffice)
- [User Roles & Permissions](#user-roles--permissions)
- [User Types (Provider Categories)](#user-types-provider-categories)
- [Provider Profiles](#provider-profiles)

---

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
- [x] Login method selection (Phone / Email / Social)
- [x] Phone number input with country code picker (default +39 Italy)
- [x] "Send OTP" button
- [x] Email/Password login form
- [x] "Password dimenticata?" link
- [x] Divider "oppure"
- [x] Social login buttons: Google, Apple (iOS only)
- [x] "Non hai un account? Registrati" link
- [x] Terms & Privacy links at bottom

### 3.2 OTP Verification
- [x] 6-digit code input with auto-focus advance
- [x] Countdown timer (60s) for resend
- [x] "Resend Code" button (disabled during countdown)
- [x] Auto-submit on complete
- [x] Error handling with shake animation

### 3.3 Registration
- [x] Registration method selection (Email / Social / Phone)
- [x] Email/Password registration form
- [x] Full name input
- [x] Email input
- [x] Password input (min 6 characters)
- [x] Date of birth picker
- [x] Avatar upload (camera/gallery)
- [x] Section preference (FIT/FUN/LIFE priority)
- [x] Terms & Privacy checkbox (required)
- [x] "Completa Registrazione" / "Crea Account" CTA

### 3.4 Password Reset
- [x] Email input for reset link
- [x] Success confirmation screen
- [x] Resend option

### 3.5 Permissions (after registration)
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
- [x] Featured event hero banner (full width, auto-scroll dots)
- [x] Quick actions: "Eventi", "VR", "Party", "TV"
- [x] "Prossimi Eventi" list
  - Event cards with date, title, price, tags (Hot/VIP/Nuovo)
- [x] "VR Experiences" carousel with ratings and levels
- [x] "Live Now" streaming indicator with pulsing animation
- [x] "Palinsesto" TV schedule preview with channel badges
- [x] "Party Mode" CTA card (private events)

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
- [x] Toggle: List view / Map view
- [x] Filter bar UI: Distance, Rating, Amenities, Price range
- [x] Sort: Nearest, Top rated, Price low-high
- [x] Gym cards in list
- [ ] Map with real Mapbox GL and clustered markers (currently mock)
- [x] Search bar

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

---

## User Profile

### Profile Management

#### Personal Information
- **Name and Bio**: Full name display with editable biography
- **Profile Photo**: Avatar upload with crop and resize functionality
- **Contact Details**: 
  - Email address with verification status
  - Phone number with SMS verification
  - Preferred contact method settings
- **Social Media Links**: Connect Instagram, Facebook, LinkedIn profiles
- **Date of Birth**: Age verification for certain services

#### Notification Preferences
- Push notifications toggle
- Email notifications settings
- SMS notifications for bookings
- Marketing communications preferences
- Notification quiet hours

#### Privacy Settings
- Profile visibility (public/private)
- Show/hide contact information
- Booking history visibility
- Review visibility settings
- Data download request
- Account deletion option

### Provider Profiles

Provider profiles extend the base user profile with professional features:

#### Professional Information
- **Professional Bio**: Extended description of expertise and approach
- **Specialties**: Tags for areas of expertise (e.g., "Weight Loss", "Strength Training")
- **Services Offered**: List of available services with descriptions
- **Certifications**: 
  - Document upload with verification status
  - Certificate name, issuing organization, date
  - Verification badge when approved by admin
- **Education History**: Degrees, institutions, graduation dates
- **Experience**: Years of professional experience
- **Languages Spoken**: Multi-language support for international users

#### Portfolio & Gallery
- Before/after photo gallery
- Work samples and demonstrations
- Video introductions
- Client testimonials showcase

#### Availability & Scheduling
- Weekly schedule configuration (Mon-Sun)
- Time slot management
- Buffer time between appointments
- Exception dates (holidays, time off)
- Advance booking window settings
- Same-day booking availability

#### Service Pricing
- Service-specific pricing
- Duration options
- Package deals and discounts
- Home service surcharges
- Deposit requirements

#### Client Reviews
- Star rating display
- Written review showcase
- Response to reviews
- Average rating calculation
- Review count statistics

#### Verification Badge
- Displayed on profile when verified
- Verification requirements checklist
- Re-verification for expired certifications

---

## Booking System

### For Customers

#### Search and Discovery
- **Provider Search**: Keyword search across provider profiles
- **Advanced Filters**:
  - Category (Fitness, Wellness, Beauty, etc.)
  - Price range
  - Availability (today, this week, flexible)
  - Location/distance
  - Rating and review count
  - Home service availability
  - Language spoken
- **Sort Options**: Recommended, nearest, highest rated, most reviewed, price

#### Provider Profiles
- View full provider profile
- See services and pricing
- Check availability calendar
- Read reviews and ratings
- View portfolio/gallery
- Contact provider (pre-booking)

#### Booking Flow
1. Select service from provider's offerings
2. Choose booking type (in-venue, home service, virtual)
3. Select date and time from available slots
4. Add service address (for home services)
5. Add special requests or notes
6. Review booking summary
7. Apply promo code (optional)
8. Select payment method
9. Pay deposit or full amount
10. Receive instant confirmation

#### Booking Management
- **My Bookings Dashboard**:
  - Upcoming bookings with countdown
  - Past booking history
  - Cancelled bookings
  - Filter by status and date range
- **Reschedule**: Change date/time if provider availability permits
- **Cancel Booking**: With cancellation policy applied
- **Rebook**: Quick rebooking with previous providers

#### Payment Integration
- Multiple payment methods (credit card, wallet, points)
- Secure Stripe integration
- Deposit or full payment options
- Points redemption at checkout
- Promo code application
- Automatic invoicing

#### Calendar Sync
- Add bookings to device calendar
- Sync with Google Calendar
- Sync with Apple Calendar
- Export booking schedule

### For Providers

#### Provider Dashboard
- **Stats Overview**:
  - Total bookings (today, week, month)
  - Total earnings
  - Rating summary
  - New client count
- **Quick Actions**: Confirm pending bookings, add availability

#### Availability Management
- **Weekly Schedule**: Set standard working hours per day
- **Exception Dates**: Block off holidays or personal time
- **Bulk Availability**: Set recurring patterns
- **Quick Toggle**: Mark as unavailable for today
- **Calendar View**: Visual availability management

#### Booking Management
- **Incoming Bookings**:
  - New booking notifications
  - Pending confirmation queue
  - Auto-accept options
- **Booking Calendar**:
  - Day/week/month views
  - Color-coded by status
  - Click to view details
- **Actions**:
  - Confirm/reject bookings
  - Mark as completed
  - Add internal notes
  - Contact customer

#### Client Management
- **Client Directory**: List of all past and current clients
- **Client Profiles**: View booking history per client
- **Notes**: Add private notes about clients
- **Messaging**: In-app communication

#### Earnings & Payouts
- **Earnings Dashboard**:
  - Total earnings breakdown
  - Pending payouts
  - Commission details
  - Payout history
- **Withdrawal Requests**: 
  - Request payouts to bank account
  - Minimum payout thresholds
  - Payout schedule settings

#### Performance Analytics
- **Booking Analytics**:
  - Booking trends over time
  - Peak hours/days
  - Cancellation rates
- **Revenue Analytics**:
  - Revenue by service type
  - Month-over-month growth
  - Average booking value
- **Client Analytics**:
  - New vs returning clients
  - Client retention rate
  - Referral tracking

---

## Admin Backoffice

### Dashboard

#### Platform Overview
- **Key Metrics**:
  - Total registered users
  - Active providers
  - Total bookings (today, week, month)
  - Total revenue
  - Pending verifications
- **Real-time Activity**: Live feed of platform activity
- **Quick Actions**: 
  - Verify pending providers
  - Process refunds
  - Respond to support tickets

#### Charts and Analytics
- **User Growth**: Registration trends over time
- **Booking Volume**: Daily/weekly/monthly booking charts
- **Revenue Charts**: Platform earnings visualization
- **Provider Performance**: Top performing providers
- **Geographic Distribution**: User and provider locations

### User Management

#### User Directory
- **List View**: All users with search and filters
- **User Details**: Complete profile information
- **Actions**:
  - View user profile
  - Edit user information
  - Change user role
  - Suspend/activate account
  - Reset password
  - Delete account (GDPR compliance)

#### Role Management
- Assign roles (customer, provider, admin)
- Bulk role changes
- Role change audit log

### Provider Management

#### Verification Queue
- **Pending Verifications**: List of providers awaiting approval
- **Document Review**:
  - View uploaded certifications
  - Check document validity
  - Request additional documents
- **Approval Actions**:
  - Approve with verification badge
  - Reject with reason
  - Request more information

#### Provider Directory
- **All Providers**: Searchable, filterable list
- **Provider Status**: Active, pending, suspended, rejected
- **Performance View**: Bookings, ratings, earnings per provider
- **Actions**:
  - Edit provider profile
  - Suspend/activate provider
  - Remove verification badge

### Booking Management

#### Booking Overview
- **All Bookings**: Complete list with advanced filters
- **Booking Details**: Full booking information
- **Status Management**:
  - Cancel bookings
  - Process refunds
  - Reschedule bookings
  - Add admin notes

#### Export and Reporting
- Export booking data (CSV, Excel)
- Filter by date range, status, provider
- Generate reports

### Content Management

#### User Types (Provider Categories)
- **Create/Edit Categories**:
  - Category name and slug
  - Description and icon
  - Requirements list
  - Default services
- **Ordering**: Drag-drop to reorder categories
- **Enable/Disable**: Toggle category availability

#### Venues Management
- **Add/Edit Venues**:
  - Basic information (name, address, contact)
  - Location and geocoding
  - Amenities and features
  - Operating hours
  - Photos and media
- **Partner Status**: Mark as partner venue
- **Featured Venues**: Promote on homepage

#### Platform Settings
- **General Settings**:
  - Platform name and branding
  - Default language and currency
  - Contact information
- **Booking Settings**:
  - Cancellation policies
  - Deposit requirements
  - Booking lead time
- **Payment Settings**:
  - Commission rates
  - Payout schedules
  - Tax configuration

### Finance

#### Transaction History
- **All Transactions**: Complete payment records
- **Filters**: By date, user, status, type
- **Details**: Payment intent, amount, fees

#### Provider Payouts
- **Payout Queue**: Pending provider withdrawals
- **Process Payouts**: Approve and process payments
- **Payout History**: All processed payouts

#### Commission Reports
- **Revenue Breakdown**: Platform commission earnings
- **Provider Earnings**: Total provider payouts
- **Tax Reports**: VAT/sales tax calculations

#### Refund Processing
- **Refund Requests**: List of refund requests
- **Process Refunds**: Full or partial refunds
- **Refund Policy**: Configure automatic refund rules

---

## User Roles & Permissions

### Role Hierarchy
- **Superadmin**: Full system access, can manage users, roles, and configurations
- **Admin**: Can manage platform settings, services, venues, user types
- **Provider**: Service providers (trainers, coaches, therapists)
  - Can manage own profile, services, availability
  - Can view and manage own bookings
  - Can view customer profiles for their bookings
- **Customer**: Regular users who book services
  - Can manage own profile
  - Can book services
  - Can view own booking history

### Permission Matrix
| Action | Superadmin | Admin | Provider | Customer |
|--------|-----------|-------|----------|----------|
| Manage Users | ✅ | ❌ | ❌ | ❌ |
| Manage Roles | ✅ | ❌ | ❌ | ❌ |
| Configure Platform | ✅ | ✅ | ❌ | ❌ |
| Create Services | ✅ | ✅ | Own only | ❌ |
| Manage Bookings | ✅ | ✅ | Own only | Own only |
| View Provider Profiles | ✅ | ✅ | ✅ | ✅ |

---

## User Types (Provider Categories)

### Fitness
- Personal Trainer
- Yoga Instructor
- Pilates Instructor
- CrossFit Coach

### Wellness
- Nutritionist
- Dietitian
- Massage Therapist
- Physical Therapist

### Beauty
- Hairstylist
- Makeup Artist
- Esthetician

### Mental Health
- Psychologist
- Life Coach
- Career Coach

### Education
- Pronunciation Coach
- Language Tutor

### Provider Onboarding
1. User registers with provider role
2. Admin verifies certifications
3. Provider completes profile
4. Provider sets up services and availability
5. Profile goes live

---

## Provider Profiles

### Profile Components
- **Basic Info**: Name, photo, bio, contact
- **Professional**: Specialties, certifications, experience
- **Services**: Offered services with pricing
- **Availability**: Working hours, booking slots
- **Portfolio**: Work samples, before/after
- **Reviews**: Customer ratings and feedback

### Verification Process
- Document upload for certifications
- Background check (for certain categories)
- Manual admin approval
- Verified badge on profile
