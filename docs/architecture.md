# VFit Architecture

## Table of Contents
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Database Schema](#database-schema)
- [Security](#security)
- [Environment Configuration](#environment-configuration)

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 16 (App Router, static export), React 19, TypeScript | Web application framework |
| Styling | Tailwind CSS v4 (configured via `@tailwindcss/postcss`), shadcn/ui | Component styling and UI library |
| State Management | Zustand (client stores) + TanStack Query (server state) | Global + cached server state |
| Forms | React Hook Form + Zod | Form state and runtime validation |
| i18n | Sprint i18n (messages in `src/i18n/`: it, en, es) | Multi-locale support |
| Mobile | Capacitor | Native iOS/Android apps |
| Backend | Firebase (Auth, Firestore, Storage, Functions on Node.js 24, FCM, Analytics, Crashlytics, Remote Config) | Serverless backend platform |
| Data Layer | Firebase Data Connect (GraphQL) — client in `src/dataconnect-generated/` | Typed GraphQL data access |
| Maps | Google Maps API (`@react-google-maps/api`) | Location services and mapping |
| Payments | Stripe | Payment processing |

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Web App    │  │   iOS App    │  │ Android App  │      │
│  │  (Next.js)   │  │ (Capacitor)  │  │ (Capacitor)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    FIREBASE PLATFORM                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Auth        │  │  Firestore   │  │   Storage    │      │
│  │  (OAuth,     │  │  (NoSQL DB)  │  │   (Files)    │      │
│  │   Phone OTP) │  │              │  │              │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│  ┌──────▼─────────────────▼─────────────────▼──────┐      │
│  │              Cloud Functions v2                  │      │
│  │  • Auth handlers    • Booking logic              │      │
│  │  • Payments (Stripe) • Notifications             │      │
│  └────────────────────────┬─────────────────────────┘      │
│                           │                                 │
│  ┌────────────────────────▼─────────────────────────┐      │
│  │           Scheduled Functions                     │      │
│  │  • Reminders  • Analytics  • Cleanup             │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
┌─────────▼────────┐ ┌──────▼──────┐ ┌───────▼───────┐
│   Stripe API     │ │  Google     │ │  Firebase     │
│   (Payments)     │ │  Maps API   │ │  Analytics    │
└──────────────────┘ └─────────────┘ └───────────────┘
```

---

## Frontend Architecture

### App Router Structure

The application uses Next.js App Router with the following structure:

```
src/app/
├── page.tsx                    # Landing/Splash
├── layout.tsx                  # Root layout with providers
├── globals.css                 # Global styles
├── 
├── auth/                       # Authentication flows
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── reset-password/page.tsx
│   └── verify-otp/page.tsx
│
├── home/                       # User home dashboard
│   └── page.tsx
│
├── booking/                    # Booking flow
│   ├── page.tsx               # Booking list
│   ├── [id]/page.tsx          # Booking detail
│   └── checkout/page.tsx      # Payment/checkout
│
├── provider/                   # Provider public profiles
│   ├── page.tsx               # Provider list/search
│   └── [id]/page.tsx          # Provider detail
│
├── profile/                    # User profile management
│   ├── page.tsx               # View profile
│   └── edit/page.tsx          # Edit profile
│
├── bookings/                   # My bookings
│   ├── page.tsx               # All bookings
│   └── [id]/page.tsx          # Booking detail
│
├── admin/                      # Admin backoffice
│   ├── page.tsx               # Admin dashboard
│   ├── users/page.tsx         # User management
│   ├── providers/page.tsx     # Provider management
│   ├── bookings/page.tsx      # Booking management
│   ├── content/page.tsx       # Content management
│   └── finance/page.tsx       # Financial reports
│
└── provider-dashboard/         # Provider management
    ├── page.tsx               # Provider dashboard
    ├── calendar/page.tsx      # Availability calendar
    ├── services/page.tsx      # Service management
    ├── bookings/page.tsx      # Provider bookings
    └── earnings/page.tsx      # Earnings & payouts
```

### Route Groups for Layouts

```
src/app/
├── (marketing)/               # Marketing pages (no auth)
│   ├── about/page.tsx
│   └── contact/page.tsx
│
├── (app)/                     # Main app (with auth)
│   ├── home/page.tsx
│   ├── booking/page.tsx
│   └── profile/page.tsx
│
├── (admin)/                   # Admin pages (admin only)
│   └── admin/
│       └── ...
│
└── (provider)/                # Provider pages (provider only)
    └── provider-dashboard/
        └── ...
```

### State Management

We use Zustand for global state management with the following stores:

#### Auth Store
```typescript
// stores/authStore.ts
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: 'customer' | 'provider' | 'admin' | 'superadmin' | null;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
}
```

#### Booking Store
```typescript
// stores/bookingStore.ts
interface BookingState {
  currentBooking: Booking | null;
  selectedProvider: Provider | null;
  selectedService: Service | null;
  selectedDate: Date | null;
  selectedTime: string | null;
  
  // Actions
  setProvider: (provider: Provider) => void;
  setService: (service: Service) => void;
  setDateTime: (date: Date, time: string) => void;
  createBooking: (data: BookingData) => Promise<Booking>;
  cancelBooking: (id: string) => Promise<void>;
  reset: () => void;
}
```

#### Provider Store
```typescript
// stores/providerStore.ts
interface ProviderState {
  profile: ProviderProfile | null;
  availability: AvailabilitySlot[];
  services: Service[];
  bookings: Booking[];
  earnings: EarningsSummary | null;
  
  // Actions
  loadProfile: () => Promise<void>;
  updateProfile: (data: Partial<ProviderProfile>) => Promise<void>;
  setAvailability: (slots: AvailabilitySlot[]) => Promise<void>;
  addService: (service: ServiceData) => Promise<void>;
  loadBookings: (filters?: BookingFilters) => Promise<void>;
  confirmBooking: (id: string) => Promise<void>;
  loadEarnings: () => Promise<void>;
}
```

#### Admin Store
```typescript
// stores/adminStore.ts
interface AdminState {
  dashboardStats: DashboardStats | null;
  users: User[];
  providers: Provider[];
  bookings: Booking[];
  pendingVerifications: Provider[];
  
  // Actions
  loadDashboardStats: () => Promise<void>;
  getUsers: (filters?: UserFilters) => Promise<void>;
  updateUserRole: (id: string, role: string) => Promise<void>;
  suspendUser: (id: string, reason: string) => Promise<void>;
  verifyProvider: (id: string, status: 'approved' | 'rejected') => Promise<void>;
  getBookings: (filters?: BookingFilters) => Promise<void>;
  processRefund: (bookingId: string, amount: number) => Promise<void>;
}
```

### Component Architecture

#### Shadcn/ui Components
```
src/components/ui/           # Base UI components
├── button.tsx
├── card.tsx
├── dialog.tsx
├── form.tsx
├── input.tsx
├── select.tsx
├── table.tsx
└── ...
```

#### Feature Components
```
src/components/
├── auth/                    # Authentication components
│   ├── LoginForm.tsx
│   ├── RegisterForm.tsx
│   └── SocialLogin.tsx
│
├── booking/                 # Booking flow components
│   ├── ProviderCard.tsx
│   ├── ServiceSelector.tsx
│   ├── DateTimePicker.tsx
│   ├── BookingSummary.tsx
│   └── PaymentForm.tsx
│
├── provider/                # Provider components
│   ├── ProviderProfile.tsx
│   ├── AvailabilityCalendar.tsx
│   ├── ServiceManager.tsx
│   └── BookingList.tsx
│
├── profile/                 # Profile components
│   ├── ProfileForm.tsx
│   ├── AvatarUpload.tsx
│   ├── CertificationUpload.tsx
│   └── NotificationSettings.tsx
│
├── admin/                   # Admin components
│   ├── DashboardStats.tsx
│   ├── UserTable.tsx
│   ├── ProviderVerification.tsx
│   ├── BookingManager.tsx
│   └── RevenueChart.tsx
│
└── layout/                  # Layout components
    ├── Sidebar.tsx
    ├── Header.tsx
    ├── BottomNav.tsx
    └── ProtectedRoute.tsx
```

### API Client Structure

```typescript
// lib/api/client.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase/config';

export const api = {
  // Auth
  auth: {
    login: (data: LoginData) => callFunction('login', data),
    register: (data: RegisterData) => callFunction('register', data),
    logout: () => callFunction('logout', {}),
  },
  
  // User
  user: {
    getProfile: () => callFunction('getUserProfile', {}),
    updateProfile: (data: ProfileData) => callFunction('updateProfile', data),
    uploadAvatar: (file: File) => uploadFile('updateAvatar', file),
  },
  
  // Booking
  booking: {
    searchProviders: (params: SearchParams) => callFunction('searchProviders', params),
    getAvailability: (providerId: string, date: Date) => 
      callFunction('getProviderAvailability', { providerId, date }),
    create: (data: BookingData) => callFunction('createBooking', data),
    cancel: (id: string, reason: string) => callFunction('cancelBooking', { id, reason }),
    getUserBookings: () => callFunction('listUserBookings', {}),
  },
  
  // Provider
  provider: {
    getProfile: () => callFunction('getProviderProfile', {}),
    updateProfile: (data: ProviderData) => callFunction('updateProviderProfile', data),
    setAvailability: (schedule: AvailabilityData) => callFunction('setProviderAvailability', schedule),
    getBookings: (filters?: BookingFilters) => callFunction('getProviderBookings', filters || {}),
  },
  
  // Admin
  admin: {
    getStats: () => callFunction('getAdminDashboardStats', {}),
    getUsers: (filters?: UserFilters) => callFunction('getUsers', filters || {}),
    updateUserRole: (id: string, role: string) => callFunction('updateUserRole', { id, role }),
    verifyProvider: (id: string, data: VerificationData) => callFunction('verifyProvider', { id, ...data }),
  },
};

async function callFunction<T = any>(name: string, data: any): Promise<T> {
  const fn = httpsCallable(functions, name);
  const result = await fn(data);
  return result.data as T;
}
```

---

## Backend Architecture

### Cloud Functions Structure

```
functions/src/
├── index.ts                    # Function exports
├── config/
│   ├── firebase.ts            # Firebase initialization
│   └── stripe.ts              # Stripe configuration
├── middleware/
│   ├── auth.ts                # Authentication middleware
│   └── validation.ts          # Input validation
├── utils/
│   ├── errors.ts              # Error handling
│   ├── notifications.ts       # Push/email notifications
│   └── helpers.ts             # Utility functions
├── auth/
│   ├── login.ts
│   ├── register.ts
│   ├── resetPassword.ts
│   └── initializeUserProfile.ts
├── user/
│   ├── getUserProfile.ts
│   ├── updateProfile.ts
│   ├── uploadAvatar.ts
│   ├── updateSocialLinks.ts
│   ├── updateNotificationSettings.ts
│   └── updatePrivacySettings.ts
├── provider/
│   ├── createProviderProfile.ts
│   ├── updateProviderProfile.ts
│   ├── addCertification.ts
│   ├── removeCertification.ts
│   ├── addEducation.ts
│   ├── updateAvailability.ts
│   ├── addService.ts
│   ├── updateService.ts
│   ├── getProviderBookings.ts
│   ├── confirmBooking.ts
│   └── completeBooking.ts
├── booking/
│   ├── searchProviders.ts
│   ├── getProviderAvailability.ts
│   ├── createBooking.ts
│   ├── cancelBooking.ts
│   ├── rescheduleBooking.ts
│   ├── getUserBookings.ts
│   └── getBookingDetails.ts
├── payment/
│   ├── createStripeCustomer.ts
│   ├── createPaymentIntent.ts
│   ├── processRefund.ts
│   ├── createVipSubscription.ts
│   └── stripeWebhook.ts
└── admin/
    ├── getDashboardStats.ts
    ├── getUsers.ts
    ├── updateUserRole.ts
    ├── suspendUser.ts
    ├── verifyProvider.ts
    ├── getAllBookings.ts
    ├── processRefund.ts
    ├── updatePlatformSettings.ts
    └── getSystemLogs.ts
```

### Scheduled Functions

```typescript
// functions/src/scheduled/

// Daily reminders for upcoming bookings
export const sendBookingReminders = functions.pubsub
  .schedule('0 9 * * *') // Daily at 9 AM
  .timeZone('Europe/Rome')
  .onRun(async (context) => {
    // Send reminders for bookings in next 24 hours
  });

// Process provider payouts weekly
export const processWeeklyPayouts = functions.pubsub
  .schedule('0 0 * * 1') // Weekly on Monday
  .timeZone('Europe/Rome')
  .onRun(async (context) => {
    // Calculate and process provider payouts
  });

// Cleanup expired data
export const cleanupOldData = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .timeZone('Europe/Rome')
  .onRun(async (context) => {
    // Remove old temporary files, expired tokens, etc.
  });

// Generate daily analytics
export const generateDailyAnalytics = functions.pubsub
  .schedule('0 1 * * *') // Daily at 1 AM
  .timeZone('Europe/Rome')
  .onRun(async (context) => {
    // Aggregate daily stats
  });
```

### Firestore Collections

```
users/{userId}
  - User profiles with roles and permissions
  - Subcollections:
    - addresses/{addressId}
    - notifications/{notificationId}
    - pointsTransactions/{transactionId}

userTypes/{userTypeId}
  - Provider categories (Personal Trainer, Yoga Instructor, etc.)
  - Contains: name, category, requirements, defaultServices

providers/{providerId}
  - Extended provider profiles
  - Contains: bio, specialties, certifications, services, availability
  - Subcollections:
    - availability/{dateId}
    - reviews/{reviewId}
    - portfolio/{itemId}

bookings/{bookingId}
  - All booking records
  - Contains: customerId, providerId, service details, status, payment

venues/{venueId}
  - Physical locations (gyms, wellness centers)
  - Subcollections:
    - services/{serviceId}
    - reviews/{reviewId}
    - classes/{classId}

services/{serviceId}
  - Service definitions
  - Can be global or venue-specific

payments/{paymentId}
  - Transaction records
  - Contains: stripe data, amount, status, refunds

logs/{logId}
  - Audit logs for admin actions
  - Contains: action, userId, timestamp, details

settings/{settingId}
  - Platform configuration
  - Contains: commission rates, policies, feature flags
```

### Collection Schema Details

#### Users Collection
```typescript
interface User {
  uid: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  
  // Role-based access
  role: 'superadmin' | 'admin' | 'provider' | 'customer';
  userType?: string;          // Provider category
  
  // Provider specific
  isVerified?: boolean;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  certifications?: string[];
  
  // VIP/Customer
  isVip: boolean;
  vipExpiresAt?: Timestamp;
  pointsBalance: number;
  walletBalance: number;
  
  // Preferences
  preferredLanguage: 'it' | 'en';
  notificationsEnabled: boolean;
  notificationSettings?: {
    email: boolean;
    push: boolean;
    sms: boolean;
    marketing: boolean;
  };
  privacySettings?: {
    profileVisible: boolean;
    showContactInfo: boolean;
    showBookingHistory: boolean;
  };
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    website?: string;
  };
  
  // Referral
  referralCode: string;
  referredBy?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### Providers Collection
```typescript
interface Provider {
  id: string;
  userId: string;
  
  // Basic Info
  fullName: string;
  avatarUrl?: string;
  coverImage?: string;
  bio: string;
  shortBio: string;
  
  // Professional
  userType: string;
  specialties: string[];
  certifications: Certification[];
  education: Education[];
  experienceYears: number;
  languages: string[];
  
  // Availability
  workingHours: WorkingHours[];
  
  // Services offered
  services: ProviderService[];
  
  // Location
  homeServiceAvailable: boolean;
  homeServiceRadiusKm: number;
  homeServiceFee: number;
  serviceArea?: {
    center: GeoPoint;
    geohash: string;
  };
  
  // Ratings
  ratingAvg: number;
  reviewCount: number;
  completedBookings: number;
  
  // Status
  isVerified: boolean;
  isActive: boolean;
  acceptingNewClients: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Certification {
  id: string;
  name: string;
  issuingOrganization: string;
  issueDate: Timestamp;
  expiryDate?: Timestamp;
  documentUrl?: string;
  verified: boolean;
}

interface Education {
  id: string;
  degree: string;
  institution: string;
  fieldOfStudy?: string;
  startYear: number;
  endYear?: number;
}
```

#### Bookings Collection
```typescript
interface Booking {
  id: string;
  
  // References
  customerId: string;
  providerId?: string;
  venueId?: string;
  serviceId: string;
  
  // Denormalized data
  customerName: string;
  customerPhone: string;
  providerName?: string;
  venueName?: string;
  serviceName: string;
  
  // Booking details
  bookingType: 'in_venue' | 'home_service' | 'virtual' | 'outdoor';
  serviceAddress?: {
    street: string;
    city: string;
    location: GeoPoint;
  };
  
  // Schedule
  scheduledAt: Timestamp;
  scheduledEndAt: Timestamp;
  durationMinutes: number;
  
  // Status lifecycle
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  
  // Pricing
  originalPrice: number;
  finalPrice: number;
  depositAmount: number;
  depositPaid: boolean;
  
  // Payment
  paymentStatus: 'pending' | 'deposit_paid' | 'paid' | 'refunded';
  stripePaymentIntentId?: string;
  
  // Metadata
  customerNotes?: string;
  providerNotes?: string;
  cancellationReason?: string;
  cancelledBy?: 'customer' | 'provider';
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## Security

### Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    function hasRole(role) {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == role;
    }
    
    function isAdmin() {
      return hasRole('superadmin') || hasRole('admin');
    }
    
    function isProvider() {
      return hasRole('provider');
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isOwner(userId);
      allow update: if isOwner(userId) || isAdmin();
      allow delete: if isAdmin();
    }
    
    // Provider profiles - public read, restricted write
    match /providers/{providerId} {
      allow read: if true;  // Public profiles
      allow create: if isAdmin() || 
        (isProvider() && request.auth.uid == resource.data.userId);
      allow update: if isAdmin() || 
        (isProvider() && request.auth.uid == resource.data.userId);
    }
    
    // User types - admin managed
    match /userTypes/{typeId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    // Venues - public read, admin write
    match /venues/{venueId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    // Bookings
    match /bookings/{bookingId} {
      allow read: if isAuthenticated() && (
        resource.data.customerId == request.auth.uid ||
        resource.data.providerId == request.auth.uid ||
        isAdmin()
      );
      allow create: if isAuthenticated();
      allow update: if isAdmin() || 
        resource.data.customerId == request.auth.uid ||
        resource.data.providerId == request.auth.uid;
    }
    
    // Payments - restricted access
    match /payments/{paymentId} {
      allow read: if isAuthenticated() && (
        resource.data.customerId == request.auth.uid ||
        resource.data.providerId == request.auth.uid ||
        isAdmin()
      );
      allow write: if isAdmin();
    }
    
    // Settings - admin only
    match /settings/{settingId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    
    // Logs - admin only
    match /logs/{logId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }
  }
}
```

### Authentication Methods

| Method | Flow | Use Case |
|--------|------|----------|
| Email/Password | Email + password verification | Standard registration |
| Google OAuth | Popup/Redirect OAuth | Quick signup/login |
| Apple OAuth | Sign in with Apple | iOS users |
| Phone OTP | SMS verification code | Mobile-first users |

### Security Best Practices

1. **Role-based access control** - All data access validated by role
2. **Server-side validation** - Critical operations via Cloud Functions
3. **Input sanitization** - All user inputs validated before processing
4. **Rate limiting** - Firebase handles DDoS protection
5. **Secure file uploads** - Storage rules enforce ownership
6. **Audit logging** - All admin actions logged
7. **Data encryption** - Sensitive data encrypted at rest

---

## Environment Configuration

```typescript
// Development
const devConfig = {
  projectId: 'vfit-dev',
  useEmulators: true,
  stripeMode: 'test',
};

// Staging
const stagingConfig = {
  projectId: 'vfit-staging',
  useEmulators: false,
  stripeMode: 'test',
};

// Production
const prodConfig = {
  projectId: 'vfit-prod',
  useEmulators: false,
  stripeMode: 'live',
};
```
